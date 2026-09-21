/**
 * Animation Player Module
 * Applies Unity animations to Three.js avatars
 */

import * as THREE from "three";
import { HumanoidBoneMapper } from "./humanoidBoneMapper.js";
import { HumanoidMuscleConverter } from "./humanoidMuscleConverter.js";

export class AnimationPlayer {
  constructor(avatar, animData, parser) {
    this.avatar = avatar;
    this.animData = animData;
    this.parser = parser;
    this.isPlaying = false;
    this.isPaused = false;
    this.currentTime = 0;
    this.duration = parser.getDuration();
    this.animationFrameId = null;
    this.startTime = 0;
    this.pauseTime = 0;

    // Unity Humanoid mapper
    this.humanoidMapper = null;

    // Unity Muscle converter
    this.muscleConverter = new HumanoidMuscleConverter();
    this._lastRootTranslation = new THREE.Vector3();
    this.initializeBoneMap();
  }

  /**
   * Initialize mapping between Unity animation paths and Three.js bones
   */
  initializeBoneMap() {
    if (!this.avatar) return;

    // Find all SkinnedMesh in the avatar
    const skinnedMeshes = [];
    this.avatar.traverse((child) => {
      if (child.isSkinnedMesh) {
        skinnedMeshes.push(child);
      }
    });

    if (skinnedMeshes.length === 0) {
      console.warn("No SkinnedMesh found in avatar");
      return;
    }

    // Use the first skinned mesh
    const skinnedMesh = skinnedMeshes[0];
    const skeleton = skinnedMesh.skeleton;

    if (!skeleton || !skeleton.bones) {
      console.warn("No skeleton found in SkinnedMesh");
      return;
    }

    // Initialize Unity Humanoid mapper
    this.humanoidMapper = new HumanoidBoneMapper(skeleton);
    console.log("Unity Humanoid bone mapper initialized");
  }

  /**
   * Apply animation at current time
   */
  applyAnimation(time) {
    if (!this.animData || !this.animData.animationClip || !this.humanoidMapper)
      return;

    const floatCurves = this.animData.animationClip.m_FloatCurves;

    // Capture bind pose on first call (before any animation is applied)
    if (!this._bindPoses && this.avatar) {
      this._bindPoses = new Map();
      this.avatar.traverse((child) => {
        if (child.isBone) {
          this._bindPoses.set(child.name, child.quaternion.clone());
        }
      });
      console.log(`Captured bind pose for ${this._bindPoses.size} bones`);
    }
    if (!this._armBindCorrected) {
      const leftUpperArmFix = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        Math.PI / 2
      );

      const rightUpperArmFix = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        -Math.PI / 2
      );

      const leftUpperArm = this.humanoidMapper.getBone("LeftUpperArm");
      if (leftUpperArm) {
        leftUpperArm.quaternion.multiply(leftUpperArmFix);
        this._bindPoses.set(leftUpperArm.name, leftUpperArm.quaternion.clone());
      }

      const rightUpperArm = this.humanoidMapper.getBone("RightUpperArm");
      if (rightUpperArm) {
        rightUpperArm.quaternion.multiply(rightUpperArmFix);
        this._bindPoses.set(
          rightUpperArm.name,
          rightUpperArm.quaternion.clone()
        );
      }

      this._armBindCorrected = true;
    }

    if (!this._armBindCorrected) {
      const leftArmFix = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        Math.PI / 2
      );

      const rightArmFix = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        -Math.PI / 2
      );

      const leftArm = this.humanoidMapper.getBone("LeftUpperArm");
      if (leftArm) {
        leftArm.quaternion.multiply(leftArmFix);
        this._bindPoses.set(leftArm.name, leftArm.quaternion.clone());
      }

      const rightArm = this.humanoidMapper.getBone("RightUpperArm");
      if (rightArm) {
        rightArm.quaternion.multiply(rightArmFix);
        this._bindPoses.set(rightArm.name, rightArm.quaternion.clone());
      }

      this._armBindCorrected = true;
    }

    // Log once to show animation is running
    if (!this._hasLoggedPlayback) {
      console.log(
        `Playing animation at time ${time.toFixed(
          2
        )}s of ${this.duration.toFixed(2)}s`
      );
      console.log(`Processing ${floatCurves.length} animation curves`);
      this._hasLoggedPlayback = true;
    }

    // First pass: collect all values
    const rootTranslation = { x: 0, y: 0, z: 0 };
    const rotations = new Map();
    const muscleValues = {};
    const unmatchedProperties = [];

    floatCurves.forEach((curve) => {
      const value = this.getValueAtTime(curve, time);
      if (value === null || !curve.attribute) return;

      // Check if this is a muscle property
      const muscleDef = this.muscleConverter.getMuscleDefinition(
        curve.attribute
      );
      if (muscleDef) {
        // This is a muscle-space property
        muscleValues[curve.attribute] = value;
        return;
      }

      // Parse Unity animation property (for direct bone rotations/translations)
      const boneInfo = this.humanoidMapper.getBoneFromProperty(curve.attribute);
      if (!boneInfo || !boneInfo.bone) {
        // Track properties that couldn't be matched
        if (!unmatchedProperties.includes(curve.attribute)) {
          unmatchedProperties.push(curve.attribute);
        }
        return;
      }

      const boneName = boneInfo.boneName;

      if (boneInfo.isTranslation) {
        // Only apply Root translation to move the entire avatar
        // Hand/Foot translations are IK targets, not bone positions
        if (boneName === "Root") {
          rootTranslation[boneInfo.component] = value;
        }
        // Ignore other translations (LeftHand, RightHand, LeftFoot, RightFoot)
        // These are IK goal positions in Unity Humanoid, not bone positions
      } else if (boneInfo.isRotation) {
        if (!rotations.has(boneName)) {
          rotations.set(boneName, {
            bone: boneInfo.bone,
            x: 0,
            y: 0,
            z: 0,
            w: 1,
          });
        }
        rotations.get(boneName)[boneInfo.component] = value;
      }
    });

    // Convert muscle values to bone rotations
    // In Unity Humanoid animations:
    // - Muscle values = the actual animation data for body bones
    // - Direct quaternions (RootQ, LeftFootQ, RightFootQ, LeftHandQ, RightHandQ) = IK goal rotations
    // - For bones with muscle data, ONLY use muscle values (they're the animation)
    // - For IK goals (hands/feet), use direct quaternions
    const muscleRotations = this.muscleConverter.musclesToEulers(muscleValues);
    for (const [boneName, eulers] of muscleRotations.entries()) {
      const bone = this.humanoidMapper.getBone(boneName);
      if (bone) {
        const muscleQuat = this.muscleConverter.eulersToQuaternion(eulers);

        // OVERRIDE any existing direct quaternion with muscle data
        // Muscle values are the authoritative animation data for body bones
        rotations.set(boneName, {
          bone: bone,
          x: muscleQuat.x,
          y: muscleQuat.y,
          z: muscleQuat.z,
          w: muscleQuat.w,
        });
      }
    }

    // Log first frame data once
    if (!this._hasLoggedFirstFrame && time < 0.1) {
      console.log(
        "First frame root translation:",
        `(${rootTranslation.x.toFixed(3)}, ${rootTranslation.y.toFixed(
          3
        )}, ${rootTranslation.z.toFixed(3)})`
      );
      console.log(`Muscle values found: ${Object.keys(muscleValues).length}`);
      console.log(
        "Sample muscle values:",
        Object.entries(muscleValues)
          .slice(0, 5)
          .map(([name, val]) => `${name}: ${val.toFixed(3)}`)
      );

      // Log muscle to angle conversion for debugging
      const sampleConversions = Object.entries(muscleValues)
        .slice(0, 3)
        .map(([name, val]) => {
          const def = this.muscleConverter.getMuscleDefinition(name);
          const angle = this.muscleConverter.muscleToAngle(name, val);
          return `${name}: muscle=${val.toFixed(3)} → angle=${angle.toFixed(
            1
          )}° (range: [${def.range[0]}, ${def.range[1]}])`;
        });
      console.log("Sample muscle→angle conversions:", sampleConversions);

      console.log(`Total bones with rotation data: ${rotations.size}`);
      console.log(`  - From muscle data: ${muscleRotations.size} bones`);
      console.log(
        `  - From direct quaternions: ${
          rotations.size - muscleRotations.size
        } bones`
      );
      console.log(
        "Bones animated by muscles:",
        Array.from(muscleRotations.keys())
      );

      // Find bones with only direct quaternions (IK goals)
      const directOnlyBones = Array.from(rotations.keys()).filter(
        (name) => !muscleRotations.has(name)
      );
      console.log(
        "Bones animated by direct quaternions (IK goals):",
        directOnlyBones
      );

      // Log sample Euler angles from muscle conversion
      if (muscleRotations.size > 0) {
        const sampleBone = Array.from(muscleRotations.entries())[0];
        const [boneName, eulers] = sampleBone;
        console.log(
          `Sample bone rotation (${boneName}):`,
          `x=${THREE.MathUtils.radToDeg(eulers.x).toFixed(1)}°`,
          `y=${THREE.MathUtils.radToDeg(eulers.y).toFixed(1)}°`,
          `z=${THREE.MathUtils.radToDeg(eulers.z).toFixed(1)}°`
        );
      }

      if (unmatchedProperties.length > 0) {
        console.warn(
          `Found ${unmatchedProperties.length} unmatched animation properties:`
        );
        console.log("Unmatched properties:", unmatchedProperties.slice(0, 20));
      }

      this._hasLoggedFirstFrame = true;
    }

    // Second pass: apply root translation to avatar root
    if (this.avatar) {
      const currentRoot = new THREE.Vector3(
        rootTranslation.x,
        0,
        rootTranslation.z
      );

      const delta = currentRoot.clone().sub(this._lastRootTranslation);
      this.avatar.position.add(delta);
      this._lastRootTranslation.copy(currentRoot);
    }

    // Third pass: apply rotations to bones
    for (const [boneName, data] of rotations.entries()) {
      if (boneName === "Root") continue;

      // Apply all rotations directly (both muscle and direct quaternions)
      // Unity Humanoid animations store complete pose rotations, not deltas
      const bindPose = this._bindPoses.get(data.bone.name);
      const animQuat = new THREE.Quaternion(
        data.x,
        data.y,
        data.z,
        data.w
      ).normalize();
      if (bindPose) {
        // FINAL = bindPose * animationDelta
        data.bone.quaternion.copy(bindPose).multiply(animQuat);
      } else {
        data.bone.quaternion.copy(animQuat);
      }
    }
  }

  /**
   * Get interpolated value at specific time for a curve
   */
  getValueAtTime(curve, time) {
    if (!curve || !curve.curve || !curve.curve.m_Curve) return null;

    const keyframes = curve.curve.m_Curve;
    if (keyframes.length === 0) return null;

    // Handle out of bounds
    if (time <= keyframes[0].time) return keyframes[0].value;
    if (time >= keyframes[keyframes.length - 1].time) {
      return keyframes[keyframes.length - 1].value;
    }

    // Find surrounding keyframes
    for (let i = 0; i < keyframes.length - 1; i++) {
      const k1 = keyframes[i];
      const k2 = keyframes[i + 1];

      if (time >= k1.time && time <= k2.time) {
        // Hermite interpolation using slopes
        const t = (time - k1.time) / (k2.time - k1.time);
        const t2 = t * t;
        const t3 = t2 * t;

        const dt = k2.time - k1.time;

        // Hermite basis functions
        const h00 = 2 * t3 - 3 * t2 + 1;
        const h10 = t3 - 2 * t2 + t;
        const h01 = -2 * t3 + 3 * t2;
        const h11 = t3 - t2;

        // Interpolate with tangents
        return (
          h00 * k1.value +
          h10 * k1.outSlope * dt +
          h01 * k2.value +
          h11 * k2.inSlope * dt
        );
      }
    }

    return null;
  }

  /**
   * Play animation
   */
  play() {
    if (this.isPlaying && !this.isPaused) return;

    if (this.isPaused) {
      // Resume from pause
      this.startTime = performance.now() - this.pauseTime;
      this.isPaused = false;
    } else {
      // Start from beginning
      this.startTime = performance.now();
      this.currentTime = 0;

      // Store original bone transforms to restore later
      this.storeOriginalTransforms();
    }

    this.isPlaying = true;
    this._lastRootTranslation.set(0, 0, 0);

    this.animate();

    console.log("Animation playing");
  }

  /**
   * Store original bone transforms
   */
  storeOriginalTransforms() {
    if (!this.avatar) return;

    this.originalTransforms = new Map();

    this.avatar.traverse((child) => {
      if (child.isBone) {
        this.originalTransforms.set(child, {
          position: child.position.clone(),
          quaternion: child.quaternion.clone(),
          scale: child.scale.clone(),
        });
      }
    });
  }

  /**
   * Pause animation
   */
  pause() {
    if (!this.isPlaying || this.isPaused) return;

    this.isPaused = true;
    this.pauseTime = performance.now() - this.startTime;

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    console.log("Animation paused at", this.currentTime);
  }

  /**
   * Stop animation and restore original transforms
   */
  stop() {
    this.isPlaying = false;
    this.isPaused = false;
    this.currentTime = 0;
    this.startTime = 0;
    this.pauseTime = 0;

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this._lastRootTranslation.set(0, 0, 0);

    // Restore original bone transforms
    this.restoreOriginalTransforms();

    console.log("Animation stopped");
  }

  /**
   * Restore original bone transforms
   */
  restoreOriginalTransforms() {
    if (!this.originalTransforms || !this.avatar) return;

    this.originalTransforms.forEach((transform, bone) => {
      bone.position.copy(transform.position);
      bone.quaternion.copy(transform.quaternion);
      bone.scale.copy(transform.scale);
    });

    // Reset avatar position
    this.avatar.position.set(0, 0, 0);
  }

  /**
   * Animation loop
   */
  animate() {
    if (!this.isPlaying || this.isPaused) return;

    const elapsed = performance.now() - this.startTime;
    this.currentTime = (elapsed / 1000) % this.duration;

    // Apply animation at current time
    this.applyAnimation(this.currentTime);

    // Continue loop
    this.animationFrameId = requestAnimationFrame(() => this.animate());
  }

  /**
   * Get current playback state
   */
  getState() {
    return {
      isPlaying: this.isPlaying,
      isPaused: this.isPaused,
      currentTime: this.currentTime,
      duration: this.duration,
      progress: this.currentTime / this.duration,
    };
  }

  /**
   * Cleanup
   */
  dispose() {
    this.stop();

    // Clear cached data
    if (this._bindPoses) {
      this._bindPoses.clear();
    }
    if (this.originalTransforms) {
      this.originalTransforms.clear();
    }
  }
}
