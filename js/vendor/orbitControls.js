// OrbitControls Module - Custom camera controls with smooth transitions

import * as THREE from 'three';

export class OrbitControls {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;

        this.target = new THREE.Vector3(0, 0, 0);
        this.spherical = new THREE.Spherical();
        this.sphericalDelta = new THREE.Spherical();
        this.panOffset = new THREE.Vector3();

        this.rotateSpeed = 1.0;
        this.panSpeed = 1.0;
        this.zoomSpeed = 1.0;
        this.enabled = true;

        // Limit zoom to stay inside 5m radius sphere
        this.minDistance = 0.5;
        this.maxDistance = 4.5;

        this.rotateStart = new THREE.Vector2();
        this.rotateEnd = new THREE.Vector2();
        this.rotateDelta = new THREE.Vector2();

        this.panStart = new THREE.Vector2();
        this.panEnd = new THREE.Vector2();
        this.panDelta = new THREE.Vector2();

        this.state = 'NONE';
        this.prevDistance = 0;

        // Smooth camera transition
        this.isTransitioning = false;
        this.transitionStartPos = new THREE.Vector3();
        this.transitionStartTarget = new THREE.Vector3();
        this.transitionEndPos = new THREE.Vector3();
        this.transitionEndTarget = new THREE.Vector3();
        this.transitionProgress = 0;
        this.transitionDuration = 0.8; // seconds

        // References (will be set externally)
        this.ikTargets = null;
        this.avatarModel = null;
        this.orbitTargetIndicator = null;
        this.gizmoCamera = null;

        this.init();
        this.update();
    }

    init() {
        // Store bound functions
        this.boundMouseDownHandler = (e) => {
            console.log('════════════════════════════════════');
            console.log('ORBIT CONTROLS - MOUSEDOWN CAPTURED');
            console.log('Button:', e.button, '(0=Left, 1=Middle, 2=Right)');
            console.log('Enabled:', this.enabled);
            console.log('════════════════════════════════════');
            // Prevent default behavior for middle mouse button (auto-scroll)
            if (e.button === 1) {
                e.preventDefault();
            }
            this.onMouseDown(e);
        };

        // Prevent the browser context menu but don't interfere with right-drag panning.
        // Use bubbling phase so mousedown/mousemove handlers (which may use capture) run normally.
        this.boundContextMenuHandler = (e) => {
            // Prevent the browser context menu; no debug logging to avoid console noise
            e.preventDefault();
        };

        // Use both capture and bubble phase for maximum compatibility
        this.domElement.addEventListener('mousedown', this.boundMouseDownHandler, true);
        this.domElement.addEventListener('auxclick', (e) => {
            console.log('Auxclick detected - button:', e.button);
            // Prevent default behavior for middle mouse button
            if (e.button === 1) {
                e.preventDefault();
            }
        }, true);

        this.domElement.addEventListener('wheel', this.onMouseWheel.bind(this));
        this.domElement.addEventListener('contextmenu', this.boundContextMenuHandler, false);

        this.domElement.addEventListener('touchstart', this.onTouchStart.bind(this));
        this.domElement.addEventListener('touchmove', this.onTouchMove.bind(this));
        this.domElement.addEventListener('touchend', this.onTouchEnd.bind(this));

        // Additional mousedown listener to catch middle button events
        this.domElement.addEventListener('mousedown', (e) => {
            console.log('Secondary mousedown listener - button:', e.button);
            if (e.button === 1) {
                console.log('Preventing middle button default');
                e.preventDefault();
                e.stopPropagation();
            }
        }, false);
    }

    updateOrbitTarget(event) {
        // Raycast to find intersection with avatar
        const rect = this.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.camera);

        // First check if clicking on IK target spheres - if so, skip orbit target update
        if (this.ikTargets) {
            const ikSpheres = [];
            if (this.ikTargets.leftHand) ikSpheres.push(this.ikTargets.leftHand);
            if (this.ikTargets.rightHand) ikSpheres.push(this.ikTargets.rightHand);
            if (this.ikTargets.leftFoot) ikSpheres.push(this.ikTargets.leftFoot);
            if (this.ikTargets.rightFoot) ikSpheres.push(this.ikTargets.rightFoot);
            if (this.ikTargets.head) ikSpheres.push(this.ikTargets.head);

            const sphereIntersects = raycaster.intersectObjects(ikSpheres, false);
            if (sphereIntersects.length > 0) {
                // Clicking on IK sphere - don't update orbit target
                return;
            }
        }

        // Get all meshes from avatar
        if (this.avatarModel) {
            const meshes = [];
            this.avatarModel.traverse((child) => {
                if (child.isMesh) {
                    meshes.push(child);
                }
            });

            const intersects = raycaster.intersectObjects(meshes, false);
            if (intersects.length > 0) {
                const newTarget = intersects[0].point;

                // Start smooth transition to new target
                this.startTransitionToTarget(newTarget);

                console.log('Orbit target updated to:', newTarget);

                // Show orbit indicator briefly
                if (this.orbitTargetIndicator) {
                    this.orbitTargetIndicator.visible = true;
                    this.orbitTargetIndicator.position.copy(newTarget);
                    // Hide after 2 seconds
                    setTimeout(() => {
                        this.orbitTargetIndicator.visible = false;
                    }, 2000);
                }
            }
        }
    }

    startTransitionToTarget(newTarget) {
        // Store current state
        this.transitionStartPos.copy(this.camera.position);
        this.transitionStartTarget.copy(this.target);

        // Calculate new camera position maintaining same distance and direction
        const offset = this.camera.position.clone().sub(this.target);
        const distance = offset.length();

        // New camera position: newTarget + offset (maintaining same relative position)
        this.transitionEndPos.copy(newTarget).add(offset);
        this.transitionEndTarget.copy(newTarget);

        // Start transition
        this.isTransitioning = true;
        this.transitionProgress = 0;
        this.transitionStartTime = performance.now() / 1000; // Convert to seconds
    }

    onMouseDown(event) {
        console.log('MouseDown event received - button:', event.button, 'enabled:', this.enabled);

        if (!this.enabled) return;

        event.preventDefault();
        event.stopPropagation();

        // Cancel any ongoing transition when user starts interacting
        this.isTransitioning = false;

        if (event.button === 0) {
            // Left click - only for selection, store click position
            console.log('Left button detected - selection only');
            this.clickStartPos = { x: event.clientX, y: event.clientY };
            this.state = 'SELECT';
        } else if (event.button === 1) {
            // Middle click (wheel) - panning (Unity style)
            console.log('Middle button detected - setting PAN state');
            this.state = 'PAN';
            this.panStart.set(event.clientX, event.clientY);
            console.log('Pan started at:', this.panStart);
        } else if (event.button === 2) {
            // Right click - rotate (Unity style)
            console.log('✓ UNITY MODE: Right button ROTATES camera');
            this.state = 'ROTATE';
            this.rotateStart.set(event.clientX, event.clientY);
        }

        this.boundMouseMove = this.onMouseMove.bind(this);
        this.boundMouseUp = this.onMouseUp.bind(this);
        document.addEventListener('mousemove', this.boundMouseMove);
        document.addEventListener('mouseup', this.boundMouseUp);
    }

    onMouseMove(event) {
        if (!this.enabled) return;

        event.preventDefault();

        if (this.state === 'ROTATE') {
            this.rotateEnd.set(event.clientX, event.clientY);
            this.rotateDelta.subVectors(this.rotateEnd, this.rotateStart);

            this.sphericalDelta.theta -= 2 * Math.PI * this.rotateDelta.x / this.domElement.clientWidth * this.rotateSpeed;
            this.sphericalDelta.phi -= 2 * Math.PI * this.rotateDelta.y / this.domElement.clientHeight * this.rotateSpeed;

            this.rotateStart.copy(this.rotateEnd);
        } else if (this.state === 'PAN') {
            this.panEnd.set(event.clientX, event.clientY);
            this.panDelta.subVectors(this.panEnd, this.panStart);

            console.log('Panning - delta:', this.panDelta.x, this.panDelta.y);
            this.pan(this.panDelta.x, this.panDelta.y);
            this.panStart.copy(this.panEnd);
        }

        this.update();
    }

    onMouseUp(event) {
        // Check if it was a click (not a drag) on left button
        if (this.state === 'SELECT' && this.clickStartPos && event.button === 0) {
            const dx = Math.abs(event.clientX - this.clickStartPos.x);
            const dy = Math.abs(event.clientY - this.clickStartPos.y);
            const dragThreshold = 5; // pixels

            // Only update orbit target if it was a click, not a drag
            if (dx < dragThreshold && dy < dragThreshold) {
                this.updateOrbitTarget(event);
            }
        }

        this.state = 'NONE';
        if (this.boundMouseMove) {
            document.removeEventListener('mousemove', this.boundMouseMove);
        }
        if (this.boundMouseUp) {
            document.removeEventListener('mouseup', this.boundMouseUp);
        }
    }

    onMouseWheel(event) {
        if (!this.enabled) return;

        // Check if pointing at avatar body
        const rect = this.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.camera);

        // Get avatar meshes
        let avatarMeshes = [];
        if (this.avatarModel) {
            this.avatarModel.traverse((child) => {
                if (child.isMesh && child.isSkinnedMesh) {
                    avatarMeshes.push(child);
                }
            });
        }

        const intersects = raycaster.intersectObjects(avatarMeshes, false);

        if (intersects.length > 0) {
            // Pointing at avatar - zoom toward intersection point
            event.preventDefault();

            const targetPoint = intersects[0].point;
            const zoomSpeed = event.deltaY < 0 ? 0.95 : 1.05;

            // Move camera toward/away from target point
            const direction = targetPoint.clone().sub(this.camera.position);
            const distance = direction.length();

            // Calculate new distance
            const newDistance = distance * zoomSpeed;

            // Clamp to min/max
            const clampedDistance = Math.max(this.minDistance, Math.min(this.maxDistance, newDistance));

            // Set new camera position
            const normalizedDir = direction.normalize();
            this.camera.position.copy(targetPoint).sub(normalizedDir.multiplyScalar(clampedDistance));

            // Update orbit target to intersection point
            this.target.copy(targetPoint);
        } else {
            // Not pointing at avatar - use normal zoom
            event.preventDefault();

            const scale = event.deltaY < 0 ? 0.95 : 1 / 0.95;
            const offset = this.camera.position.clone().sub(this.target);
            const sph = new THREE.Spherical().setFromVector3(offset);

            this.sphericalDelta.radius = sph.radius * (scale - 1);
        }

        this.update();
    }

    onTouchStart(event) {
        if (!this.enabled) return;

        event.preventDefault();

        if (event.touches.length === 1) {
            // Single touch - update orbit target
            const touchEvent = {
                clientX: event.touches[0].clientX,
                clientY: event.touches[0].clientY
            };
            this.updateOrbitTarget(touchEvent);
            this.state = 'ROTATE';
            this.rotateStart.set(event.touches[0].clientX, event.touches[0].clientY);
        } else if (event.touches.length === 2) {
            this.state = 'DOLLY_PAN';

            const dx = event.touches[0].clientX - event.touches[1].clientX;
            const dy = event.touches[0].clientY - event.touches[1].clientY;
            this.prevDistance = Math.sqrt(dx * dx + dy * dy);

            const x = (event.touches[0].clientX + event.touches[1].clientX) * 0.5;
            const y = (event.touches[0].clientY + event.touches[1].clientY) * 0.5;
            this.panStart.set(x, y);
        }
    }

    onTouchMove(event) {
        if (!this.enabled) return;

        event.preventDefault();

        if (this.state === 'ROTATE' && event.touches.length === 1) {
            this.rotateEnd.set(event.touches[0].clientX, event.touches[0].clientY);
            this.rotateDelta.subVectors(this.rotateEnd, this.rotateStart);

            this.sphericalDelta.theta -= 2 * Math.PI * this.rotateDelta.x / this.domElement.clientWidth * this.rotateSpeed;
            this.sphericalDelta.phi -= 2 * Math.PI * this.rotateDelta.y / this.domElement.clientHeight * this.rotateSpeed;

            this.rotateStart.copy(this.rotateEnd);
        } else if (this.state === 'DOLLY_PAN' && event.touches.length === 2) {
            const dx = event.touches[0].clientX - event.touches[1].clientX;
            const dy = event.touches[0].clientY - event.touches[1].clientY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // Calculate zoom based on the change in touch distance
            // More distance = zoom out, less distance = zoom in
            const distanceChange = distance - this.prevDistance;

            // Normalize the change by screen size for consistent behavior
            const normalizedChange = distanceChange / this.domElement.clientHeight;

            // Apply zoom with sensitivity factor
            const zoomSensitivity = 2.0;
            const zoomAmount = 1 - (normalizedChange * zoomSensitivity);

            this.prevDistance = distance;

            if (zoomAmount < 1) {
                // Fingers moving apart - zoom out
                this.dollyOut(1 / zoomAmount);
            } else if (zoomAmount > 1) {
                // Fingers moving together - zoom in
                this.dollyIn(zoomAmount);
            }

            const x = (event.touches[0].clientX + event.touches[1].clientX) * 0.5;
            const y = (event.touches[0].clientY + event.touches[1].clientY) * 0.5;
            this.panEnd.set(x, y);
            this.panDelta.subVectors(this.panEnd, this.panStart);

            this.pan(this.panDelta.x * 0.5, this.panDelta.y * 0.5);
            this.panStart.copy(this.panEnd);
        }

        this.update();
    }

    onTouchEnd() {
        this.state = 'NONE';
    }

    pan(deltaX, deltaY) {
        const offset = new THREE.Vector3();
        const position = this.camera.position;
        offset.copy(position).sub(this.target);
        let targetDistance = offset.length();

        targetDistance *= Math.tan(this.camera.fov / 2 * Math.PI / 180);

        const panLeft = new THREE.Vector3();
        const panUp = new THREE.Vector3();

        panLeft.setFromMatrixColumn(this.camera.matrix, 0);
        panLeft.multiplyScalar(-2 * deltaX * targetDistance / this.domElement.clientHeight);

        panUp.setFromMatrixColumn(this.camera.matrix, 1);
        panUp.multiplyScalar(2 * deltaY * targetDistance / this.domElement.clientHeight);

        this.panOffset.add(panLeft);
        this.panOffset.add(panUp);
    }

    dollyIn(scale) {
        const offset = this.camera.position.clone().sub(this.target);
        const sph = new THREE.Spherical().setFromVector3(offset);
        this.sphericalDelta.radius = sph.radius * (scale - 1);
    }

    dollyOut(scale) {
        this.dollyIn(1 / scale);
    }

    update() {
        // Handle smooth transition if active
        if (this.isTransitioning) {
            const currentTime = performance.now() / 1000;
            const elapsed = currentTime - this.transitionStartTime;
            this.transitionProgress = Math.min(elapsed / this.transitionDuration, 1.0);

            // Easing function (ease-in-out cubic)
            const t = this.transitionProgress;
            const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

            // Interpolate camera position and target
            this.camera.position.lerpVectors(this.transitionStartPos, this.transitionEndPos, eased);
            this.target.lerpVectors(this.transitionStartTarget, this.transitionEndTarget, eased);
            this.camera.lookAt(this.target);

            // End transition when complete
            if (this.transitionProgress >= 1.0) {
                this.isTransitioning = false;
            }

            // Update gizmo during transition
            if (this.gizmoCamera) {
                const mainCameraDirection = new THREE.Vector3();
                this.camera.getWorldDirection(mainCameraDirection);
                const distance = 3;
                this.gizmoCamera.position.copy(mainCameraDirection).multiplyScalar(-distance);
                this.gizmoCamera.lookAt(0, 0, 0);
            }

            return; // Skip normal update during transition
        }

        const offset = new THREE.Vector3();
        const quat = new THREE.Quaternion().setFromUnitVectors(
            this.camera.up,
            new THREE.Vector3(0, 1, 0)
        );
        const quatInverse = quat.clone().invert();

        const position = this.camera.position;
        offset.copy(position).sub(this.target);
        offset.applyQuaternion(quat);

        this.spherical.setFromVector3(offset);
        this.spherical.theta += this.sphericalDelta.theta;
        this.spherical.phi += this.sphericalDelta.phi;
        this.spherical.phi = Math.max(0.01, Math.min(Math.PI - 0.01, this.spherical.phi));

        this.spherical.radius += this.sphericalDelta.radius;
        this.spherical.radius = Math.max(this.minDistance, Math.min(this.maxDistance, this.spherical.radius));

        this.target.add(this.panOffset);

        offset.setFromSpherical(this.spherical);
        offset.applyQuaternion(quatInverse);

        position.copy(this.target).add(offset);
        this.camera.lookAt(this.target);

        this.sphericalDelta.set(0, 0, 0);
        this.panOffset.set(0, 0, 0);

        // Update gizmo camera to match main camera orientation
        if (this.gizmoCamera) {
            const mainCameraDirection = new THREE.Vector3();
            this.camera.getWorldDirection(mainCameraDirection);

            const distance = 3;
            this.gizmoCamera.position.copy(mainCameraDirection).multiplyScalar(-distance);
            this.gizmoCamera.lookAt(0, 0, 0);
        }
    }
}
