/**
 * Unity Humanoid Muscle Space Converter
 * Converts Unity's muscle-space animation data to bone quaternions
 */

import * as THREE from "three";

export class HumanoidMuscleConverter {
  constructor() {
    // Unity Humanoid muscle definitions
    // Each muscle controls a specific degree of freedom for a joint
    this.muscleDefinitions = {
      /* =========================
       SPINE / TORSO
    ========================= */

      // Spine
      "Spine Front-Back": {
        bone: "Spine",
        axis: "z",
        range: [-40, 40],
        sign: -1,
      },
      "Spine Left-Right": { bone: "Spine", axis: "x", range: [-40, 40] },
      "Spine Twist Left-Right": { bone: "Spine", axis: "y", range: [-40, 40] },

      // Chest
      "Chest Front-Back": {
        bone: "Chest",
        axis: "z",
        range: [-40, 40],
        sign: -1,
      },
      "Chest Left-Right": { bone: "Chest", axis: "x", range: [-40, 40] },
      "Chest Twist Left-Right": { bone: "Chest", axis: "y", range: [-40, 40] },

      // UpperChest
      "UpperChest Front-Back": {
        bone: "UpperChest",
        axis: "z",
        range: [-20, 20],
        sign: -1,
      },
      "UpperChest Left-Right": {
        bone: "UpperChest",
        axis: "x",
        range: [-20, 20],
      },
      "UpperChest Twist Left-Right": {
        bone: "UpperChest",
        axis: "y",
        range: [-20, 20],
      },

      /* =========================
       NECK / HEAD
    ========================= */

      // Neck
      "Neck Nod Down-Up": {
        bone: "Neck",
        axis: "y",
        range: [-40, 40],
        sign: -1,
      },
      "Neck Tilt Left-Right": { bone: "Neck", axis: "x", range: [-40, 40] },
      "Neck Turn Left-Right": { bone: "Neck", axis: "x", range: [-80, 80] },

      // Head
      "Head Nod Down-Up": {
        bone: "Head",
        axis: "y",
        range: [-40, 40]
      },
      "Head Tilt Left-Right": { bone: "Head", axis: "z", range: [-40, 40] },
      "Head Turn Left-Right": { bone: "Head", axis: "z", range: [-80, 80] },

      /* =========================
       EYES / JAW
    ========================= */

      // Eyes
      "Left Eye Down-Up": {
        bone: "LeftEye",
        axis: "z",
        range: [-15, 15],
        sign: -1,
      },
      "Left Eye In-Out": { bone: "LeftEye", axis: "y", range: [-40, 40] },

      "Right Eye Down-Up": {
        bone: "RightEye",
        axis: "z",
        range: [-15, 15],
        sign: -1,
      },
      "Right Eye In-Out": { bone: "RightEye", axis: "y", range: [-40, 40] },

      // Jaw
      "Jaw Close": { bone: "Jaw", axis: "z", range: [0, 30], sign: -1 },
      "Jaw Left-Right": { bone: "Jaw", axis: "y", range: [-10, 10] },

      /* =========================
       ARMS
    ========================= */

      // Left Shoulder

      "Left Shoulder Front-Back": {
        bone: "LeftShoulder",
        axis: "x",
        range: [-15, 15],
      },

      // Left Upper Arm
      "Left Arm Down-Up": {
        bone: "LeftUpperArm",
        axis: "z",
        range: [-60, 100],
        sign: -1,
      },
      "Left Arm Front-Back": {
        bone: "LeftUpperArm",
        axis: "x",
        range: [-80, 80],
      },
      "Left Arm Twisted In-Out": {
        bone: "LeftUpperArm",
        axis: "y",
        range: [-90, 90],
      },

      // Left Forearm
      "Left Forearm Stretch": {
        bone: "LeftLowerArm",
        axis: "z",
        range: [0, 80],
        sign: -1,
      },
      "Left Forearm Twisted In-Out": {
        bone: "LeftLowerArm",
        axis: "y",
        range: [-90, 90],
      },

      // Left Hand
      "Left Hand Down-Up": {
        bone: "LeftHand",
        axis: "z",
        range: [-80, 80],
        sign: -1,
      },
      "Left Hand In-Out": { bone: "LeftHand", axis: "x", range: [-40, 40] },

      // Right Shoulder

      "Right Shoulder Front-Back": {
        bone: "RightShoulder",
        axis: "x",
        range: [-15, 15],
      },

      // Right Upper Arm
      "Right Arm Down-Up": {
        bone: "RightUpperArm",
        axis: "z",
        range: [-60, 100],
        sign: -1,
      },
      "Right Arm Front-Back": {
        bone: "RightUpperArm",
        axis: "x",
        range: [-80, 80],
      },
      "Right Arm Twisted In-Out": {
        bone: "RightUpperArm",
        axis: "y",
        range: [-90, 90],
        sign: -1,
      },

      // Right Forearm
      "Right Forearm Stretch": {
        bone: "RightLowerArm",
        axis: "z",
        range: [0, 80],
        sign: -1,
      },
      "Right Forearm Twisted In-Out": {
        bone: "RightLowerArm",
        axis: "y",
        range: [-90, 90],
        sign: -1,
      },

      // Right Hand
      "Right Hand Down-Up": {
        bone: "RightHand",
        axis: "z",
        range: [-80, 80],
        sign: -1,
      },
      "Right Hand In-Out": { bone: "RightHand", axis: "x", range: [-40, 40] },

      /* =========================
       LEGS / FEET
    ========================= */

      // Left Upper Leg
      'Left Upper Leg Front-Back':  { bone: 'LeftUpperLeg', axis: 'x', range: [-90, 50] },
      "Left Upper Leg In-Out": {
        bone: "LeftUpperLeg",
        axis: "x",
        range: [-60, 60],
      },
      "Left Upper Leg Twisted In-Out": {
        bone: "LeftUpperLeg",
        axis: "y",
        range: [-60, 60],
      },

      // Left Lower Leg
      'Left Lower Leg Stretch':    { bone: 'LeftLowerLeg', axis: 'x', range: [0, 90] },
      "Left Lower Leg Twisted In-Out": {
        bone: "LeftLowerLeg",
        axis: "z",
        range: [-60, 60],
      },

      // Left Foot
      "Left Foot Up-Down": {
        bone: "LeftFoot",
        axis: "z",
        range: [-50, 50],
        sign: -1,
      },
      "Left Foot Twist In-Out": {
        bone: "LeftFoot",
        axis: "y",
        range: [-30, 30],
      },

      "Left Toes Up-Down": {
        bone: "LeftToes",
        axis: "z",
        range: [-50, 30],
        sign: -1,
      },

      // Right Upper Leg
      'Right Upper Leg Front-Back': { bone: 'RightUpperLeg', axis: 'x', range: [-90, 50] },
      "Right Upper Leg In-Out": {
        bone: "RightUpperLeg",
        axis: "x",
        range: [-60, 60],
      },
      "Right Upper Leg Twisted In-Out": {
        bone: "RightUpperLeg",
        axis: "y",
        range: [-60, 60],
        sign: -1,
      },

      // Right Lower Leg
      'Right Lower Leg Stretch':   { bone: 'RightLowerLeg', axis: 'x', range: [0, 90] },
      "Right Lower Leg Twisted In-Out": {
        bone: "RightLowerLeg",
        axis: "z",
        range: [-60, 60],
        sign: -1,
      },

      // Right Foot
      "Right Foot Up-Down": {
        bone: "RightFoot",
        axis: "z",
        range: [-50, 50],
        sign: -1,
      },
      "Right Foot Twist In-Out": {
        bone: "RightFoot",
        axis: "y",
        range: [-30, 30],
        sign: -1,
      },

      "Right Toes Up-Down": {
        bone: "RightToes",
        axis: "z",
        range: [-50, 30],
        sign: -1,
      },

      /* =========================
       FINGERS
    ========================= */

      ...this.generateFingerMuscles("Left"),
      ...this.generateFingerMuscles("Right"),
    };
  }

  /**
   * Generate finger muscle definitions
   */
  generateFingerMuscles(side) {
    const fingers = ["Thumb", "Index", "Middle", "Ring", "Little"];
    const segments = ["Proximal", "Intermediate", "Distal"];
    const muscles = {};

    fingers.forEach((finger) => {
      // Thumb has different ranges
      const isThumb = finger === "Thumb";

      segments.forEach((segment, index) => {
        if (isThumb && index === 1) return; // Thumb has no intermediate

        const boneName = `${side}${finger}${segment}`;
        const muscleBase = `${side} ${finger}.${index + 1}`;

        muscles[`${muscleBase} Stretched`] = {
          bone: boneName,
          axis: "x",
          range: isThumb ? [-20, 20] : [0, 90],
        };

        if (index === 0 && !isThumb) {
          muscles[`${muscleBase} Spread`] = {
            bone: boneName,
            axis: "z",
            range: [-20, 20],
          };
        }
      });
    });

    return muscles;
  }

  /**
   * Convert muscle value to angle in degrees
   * Unity muscle values range from -1 to 1, where:
   * - -1 = minimum angle (muscle fully compressed)
   * -  0 = neutral/rest pose
   * - +1 = maximum angle (muscle fully stretched)
   */
  muscleToAngle(muscleName, muscleValue) {
    const def = this.muscleDefinitions[muscleName];
    if (!def) return 0;

    const [min, max] = def.range;

    // Unity muscle value is already in [-1, 1] range
    // Map it to the angle range
    if (muscleValue < 0) {
      // Negative muscle value: interpolate between 0 and min
      return THREE.MathUtils.clamp(muscleValue * Math.abs(min), min, max);
    } else {
      // Positive muscle value: interpolate between 0 and max
      return THREE.MathUtils.clamp(muscleValue * max, min, max);
    }
  }

  /**
   * Convert muscle values to Euler angles for a bone
   */
  musclesToEulers(muscleValues) {
    // Group muscle values by bone
    const boneRotations = new Map();

    for (const [muscleName, value] of Object.entries(muscleValues)) {
      const def = this.muscleDefinitions[muscleName];
      if (!def) continue;

      const boneName = def.bone;
      if (!boneRotations.has(boneName)) {
        boneRotations.set(boneName, { x: 0, y: 0, z: 0 });
      }

      const angle = this.muscleToAngle(muscleName, value);
      const angleRad = THREE.MathUtils.degToRad(angle);

      boneRotations.get(boneName)[def.axis] = THREE.MathUtils.clamp(
        boneRotations.get(boneName)[def.axis] + angleRad,
        THREE.MathUtils.degToRad(def.range[0]),
        THREE.MathUtils.degToRad(def.range[1])
      );
    }

    return boneRotations;
  }

  /**
   * Convert Euler angles to quaternion
   * Unity's Humanoid muscle system uses local bone space rotations
   * Unity is left-handed Y-up, Three.js is right-handed Y-up
   * Convert by negating the Z axis (left-right tilt)
   */
  eulersToQuaternion(eulers) {
    // Negate Z axis to convert from left-handed to right-handed coordinate system
    const euler = new THREE.Euler(eulers.x, eulers.z, eulers.y, "XZY");

    const quat = new THREE.Quaternion();
    quat.setFromEuler(euler);
    return quat;
  }

  /**
   * Get muscle definition for a property name
   */
  getMuscleDefinition(muscleName) {
    return this.muscleDefinitions[muscleName] || null;
  }
}
