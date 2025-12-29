import * as THREE from "three"

export class PlayerControls {
    constructor(camera, scene, playerMesh, player) {
        this.gameActive = true
        this.camera = camera
        this.scene = scene
        this.playerMesh = playerMesh
        this.player = player
        
        this.defaultKeys = {w: false, s: false, a: false, d:false, r: false, space:false, shift:false, crouch:false, isFiring: false}
        this.keys = { ...this.defaultKeys }
        
        // Spherical Coordinates
        // theta is horizontal (left/right), phi is vertical (up/down)
        this.cameraRotation = { theta: 0, phi: Math.PI / 2 }

        // FPS/TPS settings
        this.targetDistance = 0.5;
        this.currentDistance = 0.5;
        this.isFPS = true;

        // Recoil Kick (The snappy physical movement during fire)
        this.recoil = { x: 0, y: 0 };
        this.targetRecoil = { x: 0, y: 0 };
        this.recoilSnappiness = 15; 
        this.recoilReturnSpeed = 10; 

        // Recoil Recovery (The smooth drift back to original aim)
        this.accumulatedRecoilY = 0;
        this.accumulatedRecoilX = 0;
        this.recoverySpeed = 5.0; // How fast the aim centers (lerp factor)
    
        this.setupEventListeners()
    }

    setupEventListeners() {
        document.addEventListener("keydown", (e) => {
            if (this.gameActive) {
                if (e.code === "Space") this.keys.space = true
                if (e.code === "ShiftLeft") this.keys.shift = true
                if (e.code === "ControlLeft") this.keys.crouch = true
                if (e.code === "Slash") this.isFPS = !this.isFPS
                else this.keys[e.key.toLowerCase()] = true
            }
        })

        document.addEventListener("keyup", (e) => {
            if (this.gameActive) {
                if (e.code === "Space") this.keys.space = false
                if (e.code === "ShiftLeft") this.keys.shift = false
                if (e.code === "ControlLeft") this.keys.crouch = false
                else this.keys[e.key.toLowerCase()] = false
            }
        })

        document.addEventListener('mousemove', (event) => {
            const sensitivity = 0.002;
            if (this.gameActive) {
                const mouseX = event.movementX * sensitivity;
                const mouseY = event.movementY * sensitivity;

                this.cameraRotation.theta -= mouseX;
                this.cameraRotation.phi -= mouseY;

                // MANUAL COMPENSATION:
                // If the player pulls the mouse in the opposite direction of the recoil,
                // we reduce the recovery buffer so the auto-centering doesn't overshoot.
                if (mouseY < 0) { // Moving mouse down
                    this.accumulatedRecoilY += mouseY;
                    if (this.accumulatedRecoilY < 0) this.accumulatedRecoilY = 0;
                }
                
                if (Math.abs(mouseX) > 0) {
                    // Check if player is moving mouse opposite to the horizontal recoil debt
                    if (Math.sign(mouseX) !== Math.sign(this.accumulatedRecoilX)) {
                        this.accumulatedRecoilX += mouseX;
                    }
                }
            }
        });

        document.addEventListener("mousedown", (e) => {
            if(e.button === 0 && this.gameActive) this.keys.isFiring = true
        })

        document.addEventListener("mouseup", (e) => {
            if(e.button === 0 && this.gameActive) this.keys.isFiring = false
        })
    }

    applyRecoil(x, y) {
        // Apply to snappy kick targets
        this.targetRecoil.x += x;
        this.targetRecoil.y += y; 

        // Add to recovery debt
        this.accumulatedRecoilY += y; 
        this.accumulatedRecoilX += x;
    }

    updateCamera(delta, isFiring) {
        // 1. HANDLE RECOIL KICK (The initial snap)
        this.targetRecoil.x = THREE.MathUtils.lerp(this.targetRecoil.x, 0, this.recoilReturnSpeed * delta)
        this.targetRecoil.y = THREE.MathUtils.lerp(this.targetRecoil.y, 0, this.recoilReturnSpeed * delta)

        this.recoil.x = THREE.MathUtils.lerp(this.recoil.x, this.targetRecoil.x, this.recoilSnappiness * delta)
        this.recoil.y = THREE.MathUtils.lerp(this.recoil.y, this.targetRecoil.y, this.recoilSnappiness * delta)

        this.cameraRotation.phi += this.recoil.y
        this.cameraRotation.theta += this.recoil.x

        // 2. HANDLE SMOOTH RECOVERY (The drift back to center)
        if (!isFiring) {
            // Store current debt
            const prevAccY = this.accumulatedRecoilY;
            const prevAccX = this.accumulatedRecoilX;

            // Lerp the debt towards zero (the "easing" effect)
            this.accumulatedRecoilY = THREE.MathUtils.lerp(this.accumulatedRecoilY, 0, this.recoverySpeed * delta);
            this.accumulatedRecoilX = THREE.MathUtils.lerp(this.accumulatedRecoilX, 0, this.recoverySpeed * delta);

            // Calculate the delta (how much the debt changed this frame)
            const diffY = prevAccY - this.accumulatedRecoilY;
            const diffX = prevAccX - this.accumulatedRecoilX;

            // Apply the difference to the rotation
            this.cameraRotation.phi -= diffY;
            this.cameraRotation.theta -= diffX;

            // Snap to zero if extremely small to prevent drifting
            if (Math.abs(this.accumulatedRecoilY) < 0.0001) this.accumulatedRecoilY = 0;
            if (Math.abs(this.accumulatedRecoilX) < 0.0001) this.accumulatedRecoilX = 0;
        }

        // 3. CLAMP VERTICAL ROTATION (Prevent flipping upside down)
        const minPhi = this.isFPS ? 0.01 : Math.PI / 12;
        const maxPhi = this.isFPS ? Math.PI - 0.01 : Math.PI / 1.5;
        this.cameraRotation.phi = THREE.MathUtils.clamp(this.cameraRotation.phi, minPhi, maxPhi);

        // 4. POSITION THE CAMERA
        this.currentDistance = THREE.MathUtils.lerp(this.currentDistance, this.isFPS ? 0.01 : 4, 0.1);
        const playerPos = this.playerMesh.position.clone();
        
        const orbitPos = new THREE.Vector3(
            this.currentDistance * Math.sin(this.cameraRotation.phi) * Math.sin(this.cameraRotation.theta),
            this.currentDistance * Math.cos(this.cameraRotation.phi),
            this.currentDistance * Math.sin(this.cameraRotation.phi) * Math.cos(this.cameraRotation.theta)
        );

        // Head point (y=1.2 is average eyes height)
        const headPoint = playerPos.clone().add(new THREE.Vector3(0, 1.2, 0));
        this.camera.position.copy(headPoint).add(orbitPos);

        // 5. LOOK DIRECTION
        const cameraDir = new THREE.Vector3().subVectors(this.camera.position, headPoint).normalize();
        const aimLookAt = headPoint.clone().add(cameraDir.clone().multiplyScalar(-10));
        this.camera.lookAt(aimLookAt);

        // 6. LAYER / SHOULDER RIG (TPS only)
        if (this.isFPS) {
            this.playerMesh.layers.set(1); // Hide character body for FPS
        } else {
            this.playerMesh.layers.set(0); // Show character body for TPS
            // Move camera slightly to the right of the head for over-the-shoulder view
            const rightSide = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), cameraDir).normalize();
            this.camera.position.add(rightSide.multiplyScalar(0.8));
            this.camera.position.y += 0.2;
        }
    }

    update(gameActive) {
        this.gameActive = gameActive
        if (!this.gameActive) {
            this.keys = { ...this.defaultKeys };
        }
        return this.keys
    }
}