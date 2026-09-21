// IK Setup Module - Handles avatar IK configuration

import * as THREE from 'three';

export function createIKTarget(position, color = 0xff0000, isLeg = false, isHead = false, sizeMultiplier = 1.0, opacity = 0.3) {
    let radius = 0.05; // Default size for hands
    if (isLeg) radius = 0.075; // Legs 1.5x larger
    if (isHead) radius = 0.10; // Head 2x larger

    // Apply custom size multiplier
    radius *= sizeMultiplier;

    const geometry = new THREE.SphereGeometry(radius, 16, 16);
    const material = new THREE.MeshStandardMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: 0.5,
        metalness: 0.3,
        roughness: 0.4,
        transparent: true,
        opacity: opacity
    });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.copy(position);
    return sphere;
}

export function setupIK(model, scene, camera, renderer, ikTargets, intermediateBones, intermediateOffsets, intermediateLengths) {
    // Find the SkinnedMesh (required for CCDIKSolver)
    let skinnedMesh = null;
    model.traverse((child) => {
        if (child.isSkinnedMesh && child.skeleton) {
            skinnedMesh = child;
        }
    });

    if (!skinnedMesh) {
        console.warn('No SkinnedMesh found in model');
        return { skinnedMesh: null, ikSolver: null, transformControl: null };
    }

    let skeleton = skinnedMesh.skeleton;

    // Debug: Print all bone names
    console.log('========== ALL BONE NAMES ==========');
    console.log('Total bones:', skeleton.bones.length);
    const boneNames = skeleton.bones.map((bone, index) => `${index}: ${bone.name}`);
    console.table(boneNames);
    console.log('====================================');

    // Bone name patterns for nathan.fbx
    const bonePatterns = {
        hips: ['_hip', 'hips', 'pelvis', 'mixamorigHips'],
        leftArm: ['upperarm_l'],
        leftForeArm: ['lowerarm_l'],
        leftHand: ['hand_l'],
        rightArm: ['upperarm_r'],
        rightForeArm: ['lowerarm_r'],
        rightHand: ['hand_r'],
        leftUpLeg: ['upperleg_l'],
        leftLeg: ['lowerleg_l'],
        leftFoot: ['foot_l'],
        rightUpLeg: ['upperleg_r'],
        rightLeg: ['lowerleg_r'],
        rightFoot: ['foot_r'],
        spine: ['spine_01', 'spine1', 'spine'],
        spine2: ['spine_02', 'spine2'],
        spine3: ['spine_03', 'spine3'],
        neck: ['neck'],
        head: ['head']
    };

    function findBoneIndex(patterns) {
        for (const pattern of patterns) {
            const index = skeleton.bones.findIndex(b => b.name.includes(pattern));
            if (index !== -1) return index;
        }
        return -1;
    }

    // Find bone indices
    const boneIndices = {
        hips: findBoneIndex(bonePatterns.hips),
        leftArm: findBoneIndex(bonePatterns.leftArm),
        leftForeArm: findBoneIndex(bonePatterns.leftForeArm),
        leftHand: findBoneIndex(bonePatterns.leftHand),
        rightArm: findBoneIndex(bonePatterns.rightArm),
        rightForeArm: findBoneIndex(bonePatterns.rightForeArm),
        rightHand: findBoneIndex(bonePatterns.rightHand),
        leftUpLeg: findBoneIndex(bonePatterns.leftUpLeg),
        leftLeg: findBoneIndex(bonePatterns.leftLeg),
        leftFoot: findBoneIndex(bonePatterns.leftFoot),
        rightUpLeg: findBoneIndex(bonePatterns.rightUpLeg),
        rightLeg: findBoneIndex(bonePatterns.rightLeg),
        rightFoot: findBoneIndex(bonePatterns.rightFoot),
        spine: findBoneIndex(bonePatterns.spine),
        spine2: findBoneIndex(bonePatterns.spine2),
        spine3: findBoneIndex(bonePatterns.spine3),
        neck: findBoneIndex(bonePatterns.neck),
        head: findBoneIndex(bonePatterns.head)
    };

    console.log('Found bone indices:', boneIndices);

    // Get world positions of bones
    model.updateMatrixWorld(true);

    // Create IK configuration
    const iks = [];
    const ikBones = [];

    // Helper to create IK chain
    function createIKChain(effectorIndex, targetColor, links, isLeg = false, isHead = false, sizeMultiplier = 1.0) {
        const worldPos = new THREE.Vector3();
        skeleton.bones[effectorIndex].getWorldPosition(worldPos);

        const targetSphere = createIKTarget(worldPos, targetColor, isLeg, isHead, sizeMultiplier);
        scene.add(targetSphere);

        const targetBone = new THREE.Bone();
        targetBone.position.copy(worldPos);
        targetBone.updateMatrix();
        targetBone.updateMatrixWorld(true);
        scene.add(targetBone);

        const targetIndex = skeleton.bones.length + ikBones.length;
        ikBones.push(targetBone);

        iks.push({
            target: targetIndex,
            effector: effectorIndex,
            links: links
        });

        targetSphere.userData.targetBone = targetBone;
        targetSphere.userData.effectorBone = skeleton.bones[effectorIndex];

        return targetSphere;
    }

    // Left Arm IK
    if (boneIndices.leftArm !== -1 && boneIndices.leftForeArm !== -1 && boneIndices.leftHand !== -1) {
        ikTargets.leftHand = createIKChain(
            boneIndices.leftHand,
            0xff0000,
            [
                { index: boneIndices.leftArm },
                {
                    index: boneIndices.leftForeArm,
                    limitation: new THREE.Vector3(0, 0, -1) // Elbow bends along -Z-axis (reversed)
                }
            ]
        );
        intermediateBones.leftWrist = skeleton.bones[boneIndices.leftForeArm];

        const wristWorld = new THREE.Vector3();
        const handWorld = new THREE.Vector3();
        intermediateBones.leftWrist.getWorldPosition(wristWorld);
        ikTargets.leftHand.userData.effectorBone.getWorldPosition(handWorld);
        intermediateOffsets.leftWrist.copy(handWorld).sub(wristWorld);
    }

    // Right Arm IK
    if (boneIndices.rightArm !== -1 && boneIndices.rightForeArm !== -1 && boneIndices.rightHand !== -1) {
        ikTargets.rightHand = createIKChain(
            boneIndices.rightHand,
            0x00ff00,
            [
                { index: boneIndices.rightArm },
                {
                    index: boneIndices.rightForeArm,
                    limitation: new THREE.Vector3(0, 0, -1) // Elbow bends along -Z-axis (reversed)
                }
            ]
        );
        intermediateBones.rightWrist = skeleton.bones[boneIndices.rightForeArm];

        const wristWorld = new THREE.Vector3();
        const handWorld = new THREE.Vector3();
        intermediateBones.rightWrist.getWorldPosition(wristWorld);
        ikTargets.rightHand.userData.effectorBone.getWorldPosition(handWorld);
        intermediateOffsets.rightWrist.copy(handWorld).sub(wristWorld);
    }

    // Left Leg IK
    if (boneIndices.leftUpLeg !== -1 && boneIndices.leftLeg !== -1 && boneIndices.leftFoot !== -1) {
        ikTargets.leftFoot = createIKChain(
            boneIndices.leftFoot,
            0x0000ff,
            [{ index: boneIndices.leftUpLeg }, { index: boneIndices.leftLeg }],
            true
        );
        intermediateBones.leftAnkle = skeleton.bones[boneIndices.leftLeg];

        const ankleWorld = new THREE.Vector3();
        const footWorld = new THREE.Vector3();
        intermediateBones.leftAnkle.getWorldPosition(ankleWorld);
        ikTargets.leftFoot.userData.effectorBone.getWorldPosition(footWorld);
        intermediateOffsets.leftAnkle.copy(footWorld).sub(ankleWorld);
    }

    // Right Leg IK
    if (boneIndices.rightUpLeg !== -1 && boneIndices.rightLeg !== -1 && boneIndices.rightFoot !== -1) {
        ikTargets.rightFoot = createIKChain(
            boneIndices.rightFoot,
            0xffff00,
            [{ index: boneIndices.rightUpLeg }, { index: boneIndices.rightLeg }],
            true
        );
        intermediateBones.rightAnkle = skeleton.bones[boneIndices.rightLeg];

        const ankleWorld = new THREE.Vector3();
        const footWorld = new THREE.Vector3();
        intermediateBones.rightAnkle.getWorldPosition(ankleWorld);
        ikTargets.rightFoot.userData.effectorBone.getWorldPosition(footWorld);
        intermediateOffsets.rightAnkle.copy(footWorld).sub(ankleWorld);
    }

    // Head/Spine IK
    if (boneIndices.head !== -1 && boneIndices.neck !== -1) {
        const links = [{ index: boneIndices.neck }];
        if (boneIndices.spine3 !== -1) links.push({ index: boneIndices.spine3 });
        if (boneIndices.spine2 !== -1) links.push({ index: boneIndices.spine2 });
        if (boneIndices.spine !== -1) links.push({ index: boneIndices.spine });

        ikTargets.head = createIKChain(boneIndices.head, 0xff00ff, links, false, true);

        intermediateBones.spines = [];
        if (boneIndices.neck !== -1) intermediateBones.spines.push(skeleton.bones[boneIndices.neck]);
        if (boneIndices.spine3 !== -1) intermediateBones.spines.push(skeleton.bones[boneIndices.spine3]);
        if (boneIndices.spine2 !== -1) intermediateBones.spines.push(skeleton.bones[boneIndices.spine2]);
        if (boneIndices.spine !== -1) intermediateBones.spines.push(skeleton.bones[boneIndices.spine]);
    }

    // Hip Control Sphere (2.5x size) - Special control for upper body movement
    // This is NOT an IK target, it's a direct control sphere
    console.log('Attempting to create hip control sphere. Hip bone index:', boneIndices.hips);

    if (boneIndices.hips !== -1) {
        const worldPos = new THREE.Vector3();
        skeleton.bones[boneIndices.hips].getWorldPosition(worldPos);

        // Create hip control sphere (2.5x size, orange color, 60% opacity)
        const hipSphere = createIKTarget(worldPos, 0xFFA500, false, false, 2.5, 0.6);
        scene.add(hipSphere);

        // Store reference to hip bone and initial position
        hipSphere.userData.hipBone = skeleton.bones[boneIndices.hips];
        hipSphere.userData.isHipControl = true;
        hipSphere.userData.lastPosition = worldPos.clone();

        ikTargets.hip = hipSphere;

        console.log('✓ Hip control sphere created at:', worldPos);
        console.log('✓ Hip bone name:', skeleton.bones[boneIndices.hips].name);
    } else {
        console.warn('⚠ Hip bone not found! Need to check bone names.');
        console.warn('Available bone names:', skeleton.bones.map(b => b.name));

        // Fallback: Try to find spine_01 parent or use bone index 0
        let fallbackBoneIndex = -1;
        if (boneIndices.spine !== -1 && skeleton.bones[boneIndices.spine].parent) {
            // Use spine's parent as hip
            const spineBone = skeleton.bones[boneIndices.spine];
            fallbackBoneIndex = skeleton.bones.indexOf(spineBone.parent);
            console.log('Trying spine parent as hip. Index:', fallbackBoneIndex, 'Name:', spineBone.parent.name);
        }

        if (fallbackBoneIndex !== -1) {
            const worldPos = new THREE.Vector3();
            skeleton.bones[fallbackBoneIndex].getWorldPosition(worldPos);

            const hipSphere = createIKTarget(worldPos, 0xFFA500, false, false, 2.5, 0.6);
            scene.add(hipSphere);

            hipSphere.userData.hipBone = skeleton.bones[fallbackBoneIndex];
            hipSphere.userData.isHipControl = true;
            hipSphere.userData.lastPosition = worldPos.clone();

            ikTargets.hip = hipSphere;

            console.log('✓ Hip control sphere created using fallback bone at:', worldPos);
            console.log('✓ Fallback bone name:', skeleton.bones[fallbackBoneIndex].name);
        }
    }

    // Add target bones to skeleton
    if (ikBones.length > 0) {
        model.updateMatrixWorld(true);
        const newBones = skeleton.bones.concat(ikBones);
        const prevInverses = Array.isArray(skeleton.boneInverses) ? skeleton.boneInverses.slice() : [];
        const newInverses = prevInverses.slice();

        ikBones.forEach(bone => {
            const inv = new THREE.Matrix4().copy(bone.matrixWorld).invert();
            newInverses.push(inv);
        });

        const newSkeleton = new THREE.Skeleton(newBones, newInverses);
        skinnedMesh.bind(newSkeleton, skinnedMesh.bindMatrix);
        skeleton = skinnedMesh.skeleton;

        // Compute segment lengths
        try {
            const leftArmBone = skeleton.bones[boneIndices.leftArm];
            const leftForeBone = skeleton.bones[boneIndices.leftForeArm];
            const leftHandBone = skeleton.bones[boneIndices.leftHand];
            if (leftArmBone && leftForeBone && leftHandBone) {
                const p0 = new THREE.Vector3();
                const p1 = new THREE.Vector3();
                const p2 = new THREE.Vector3();
                leftArmBone.getWorldPosition(p0);
                leftForeBone.getWorldPosition(p1);
                leftHandBone.getWorldPosition(p2);
                intermediateLengths.leftUpper = p0.distanceTo(p1);
                intermediateLengths.leftFore = p1.distanceTo(p2);
            }

            const rightArmBone = skeleton.bones[boneIndices.rightArm];
            const rightForeBone = skeleton.bones[boneIndices.rightForeArm];
            const rightHandBone = skeleton.bones[boneIndices.rightHand];
            if (rightArmBone && rightForeBone && rightHandBone) {
                const q0 = new THREE.Vector3();
                const q1 = new THREE.Vector3();
                const q2 = new THREE.Vector3();
                rightArmBone.getWorldPosition(q0);
                rightForeBone.getWorldPosition(q1);
                rightHandBone.getWorldPosition(q2);
                intermediateLengths.rightUpper = q0.distanceTo(q1);
                intermediateLengths.rightFore = q1.distanceTo(q2);
            }
        } catch (e) {
            console.warn('Could not compute intermediate lengths', e);
        }
    }

    console.log('IK Setup complete with', iks.length, 'IK chains');

    return { skinnedMesh, iks };
}
