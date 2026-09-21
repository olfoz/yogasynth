/**
 * Unity Humanoid to Three.js Bone Mapper
 * Maps Unity's Humanoid animation format to Three.js skeleton bones
 */

export class HumanoidBoneMapper {
    constructor(skeleton) {
        this.skeleton = skeleton;
        this.boneMap = new Map();
        this.rootBone = null;

        // Unity Humanoid bone mapping
        this.humanoidBoneNames = {
            // Core
            'Root': ['root', 'hips', 'pelvis', 'hip'],
            'Hips': ['hips', 'pelvis', 'hip'],
            'Spine': ['spine', 'spine_01', 'spine1', 'spine01'],
            'Chest': ['spine_02', 'spine2', 'spine02', 'chest', 'spine_03'],
            'UpperChest': ['spine_03', 'spine3', 'spine03', 'upperchest'],
            'Neck': ['neck'],
            'Head': ['head'],

            // Left Arm
            'LeftShoulder': ['shoulder_l', 'leftshoulder', 'shoulderl', 'shoulder.l'],
            'LeftUpperArm': ['upperarm_l', 'leftupperarm', 'upperarml', 'arm_l', 'leftarm'],
            'LeftLowerArm': ['lowerarm_l', 'leftlowerarm', 'lowerarml', 'forearm_l', 'leftforearm'],
            'LeftHand': ['hand_l', 'lefthand', 'handl'],

            // Right Arm
            'RightShoulder': ['shoulder_r', 'rightshoulder', 'shoulderr', 'shoulder.r'],
            'RightUpperArm': ['upperarm_r', 'rightupperarm', 'upperarmr', 'arm_r', 'rightarm'],
            'RightLowerArm': ['lowerarm_r', 'rightlowerarm', 'lowerarmr', 'forearm_r', 'rightforearm'],
            'RightHand': ['hand_r', 'righthand', 'handr'],

            // Left Leg
            'LeftUpperLeg': ['upperleg_l', 'leftupperleg', 'upperlegl', 'thigh_l', 'leftthigh'],
            'LeftLowerLeg': ['lowerleg_l', 'leftlowerleg', 'lowerlegl', 'calf_l', 'leftcalf', 'shin_l'],
            'LeftFoot': ['foot_l', 'leftfoot', 'footl'],
            'LeftToes': ['ball_l', 'toes_l', 'toe_l', 'leftball', 'lefttoes'],

            // Right Leg
            'RightUpperLeg': ['upperleg_r', 'rightupperleg', 'upperlegr', 'thigh_r', 'rightthigh'],
            'RightLowerLeg': ['lowerleg_r', 'rightlowerleg', 'lowerlegr', 'calf_r', 'rightcalf', 'shin_r'],
            'RightFoot': ['foot_r', 'rightfoot', 'footr'],
            'RightToes': ['ball_r', 'toes_r', 'toe_r', 'rightball', 'righttoes'],

            // Fingers - Left
            'LeftThumbProximal': ['thumb_01_l', 'thumb1_l'],
            'LeftThumbIntermediate': ['thumb_02_l', 'thumb2_l'],
            'LeftThumbDistal': ['thumb_03_l', 'thumb3_l'],
            'LeftIndexProximal': ['index_01_l', 'index1_l'],
            'LeftIndexIntermediate': ['index_02_l', 'index2_l'],
            'LeftIndexDistal': ['index_03_l', 'index3_l'],
            'LeftMiddleProximal': ['middle_01_l', 'middle1_l'],
            'LeftMiddleIntermediate': ['middle_02_l', 'middle2_l'],
            'LeftMiddleDistal': ['middle_03_l', 'middle3_l'],
            'LeftRingProximal': ['ring_01_l', 'ring1_l'],
            'LeftRingIntermediate': ['ring_02_l', 'ring2_l'],
            'LeftRingDistal': ['ring_03_l', 'ring3_l'],
            'LeftLittleProximal': ['pinky_01_l', 'pinky1_l', 'little_01_l'],
            'LeftLittleIntermediate': ['pinky_02_l', 'pinky2_l', 'little_02_l'],
            'LeftLittleDistal': ['pinky_03_l', 'pinky3_l', 'little_03_l'],

            // Fingers - Right
            'RightThumbProximal': ['thumb_01_r', 'thumb1_r'],
            'RightThumbIntermediate': ['thumb_02_r', 'thumb2_r'],
            'RightThumbDistal': ['thumb_03_r', 'thumb3_r'],
            'RightIndexProximal': ['index_01_r', 'index1_r'],
            'RightIndexIntermediate': ['index_02_r', 'index2_r'],
            'RightIndexDistal': ['index_03_r', 'index3_r'],
            'RightMiddleProximal': ['middle_01_r', 'middle1_r'],
            'RightMiddleIntermediate': ['middle_02_r', 'middle2_r'],
            'RightMiddleDistal': ['middle_03_r', 'middle3_r'],
            'RightRingProximal': ['ring_01_r', 'ring1_r'],
            'RightRingIntermediate': ['ring_02_r', 'ring2_r'],
            'RightRingDistal': ['ring_03_r', 'ring3_r'],
            'RightLittleProximal': ['pinky_01_r', 'pinky1_r', 'little_01_r'],
            'RightLittleIntermediate': ['pinky_02_r', 'pinky2_r', 'little_02_r'],
            'RightLittleDistal': ['pinky_03_r', 'pinky3_r', 'little_03_r']
        };

        this.mapBones();
    }

    /**
     * Map Unity humanoid bones to Three.js skeleton bones
     */
    mapBones() {
        if (!this.skeleton || !this.skeleton.bones) {
            console.error('Invalid skeleton provided');
            return;
        }

        const bones = this.skeleton.bones;
        console.log(`Mapping ${bones.length} bones to Unity Humanoid format`);

        // Create a lookup of all bone names (lowercase for matching)
        const boneLookup = new Map();
        bones.forEach(bone => {
            const cleanName = this.cleanBoneName(bone.name);
            boneLookup.set(cleanName.toLowerCase(), bone);
        });

        // Map each Unity humanoid bone
        let mappedCount = 0;
        for (const [humanoidName, searchTerms] of Object.entries(this.humanoidBoneNames)) {
            let found = false;

            for (const term of searchTerms) {
                if (boneLookup.has(term.toLowerCase())) {
                    const bone = boneLookup.get(term.toLowerCase());
                    this.boneMap.set(humanoidName, bone);

                    if (humanoidName === 'Root' || humanoidName === 'Hips') {
                        this.rootBone = bone;
                    }

                    mappedCount++;
                    found = true;
                    break;
                }
            }

            // If not found, try partial matching
            if (!found) {
                for (const [boneName, bone] of boneLookup.entries()) {
                    for (const term of searchTerms) {
                        if (boneName.includes(term.toLowerCase())) {
                            this.boneMap.set(humanoidName, bone);
                            mappedCount++;
                            found = true;
                            break;
                        }
                    }
                    if (found) break;
                }
            }
        }

        console.log(`Mapped ${mappedCount} Unity Humanoid bones to skeleton`);

        // Log key bones for debugging
        const keyBones = ['Root', 'Hips', 'Spine', 'LeftUpperArm', 'RightUpperArm', 'LeftUpperLeg', 'RightUpperLeg'];
        console.log('Key bone mapping:');
        keyBones.forEach(boneName => {
            const bone = this.boneMap.get(boneName);
            console.log(`  ${boneName}: ${bone ? bone.name : 'NOT FOUND'}`);
        });
    }

    /**
     * Clean bone name for matching
     */
    cleanBoneName(name) {
        // Remove common prefixes (rp_nathan_animated_003_walking_, mixamorig, etc.)
        let cleaned = name.replace(/^rp_nathan_animated_\d+_walking_/gi, '');
        cleaned = cleaned.replace(/^(mixamorig|mixamorig:|rp_)/gi, '');
        // Remove underscores and dots
        cleaned = cleaned.replace(/[_\.]/g, '');
        return cleaned;
    }

    /**
     * Get Three.js bone from Unity humanoid bone name
     */
    getBone(humanoidBoneName) {
        return this.boneMap.get(humanoidBoneName);
    }

    /**
     * Get bone from Unity animation property name
     * Examples: "RootT.x", "LeftFootQ.y", "RightHandT.z"
     */
    getBoneFromProperty(propertyName) {
        // Parse property name
        // Format: BoneNameT.x or BoneNameQ.y
        // T = Translation (position)
        // Q = Quaternion (rotation)

        const match = propertyName.match(/^(.+?)(T|Q)\.(x|y|z|w)$/);
        if (!match) {
            return null;
        }

        const boneName = match[1]; // e.g., "Root", "LeftFoot", "RightHand"
        const propertyType = match[2]; // "T" or "Q"
        const component = match[3]; // "x", "y", "z", or "w"

        return {
            bone: this.getBone(boneName),
            boneName: boneName,
            isTranslation: propertyType === 'T',
            isRotation: propertyType === 'Q',
            component: component
        };
    }

    /**
     * Get root bone
     */
    getRoot() {
        return this.rootBone || this.skeleton.bones[0];
    }
}
