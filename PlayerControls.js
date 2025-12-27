import * as THREE from "three"

export class PlayerControls {
    constructor(camera, scene, playerMesh, playerClass) {
        this.gameActive = true
        this.camera = camera
        this.scene = scene
        this.playerMesh = playerMesh
        this.playerClass = playerClass
        
        this.defaultKeys = {w: false, s: false, a: false, d:false, space:false, shift:false, crouch:false}

        this.keys = this.defaultKeys
        
        this.cameraRotation = { theta: 0, phi: Math.PI / 2.5}

        //FPS
        this.targetDistance = 5;
        this.currentDistance = 5;
        this.isFPS = false;
    
        this.controls()
    }

    controls() {
        document.addEventListener("keydown", (e) => {
            if (this.gameActive) {
                if (e.ctrlKey || e.code === "ControlLeft") e.preventDefault()
                if (e.ctrlKey || e.code === "ShiftLeft") e.preventDefault()
                if(e.code == "Space") this.keys.space = true
                if (e.code == "ShiftLeft") this.keys.shift = true
                if (e.code == "ControlLeft") this.keys.crouch = true
                else this.keys[e.key.toLowerCase()] = true
            }
        })

        document.addEventListener("keyup", (e) => {
            if (this.gameActive) {
                if(e.code == "Space") this.keys.space = false
                if(e.code == "ShiftLeft") this.keys.shift = false
                if (e.code == "ControlLeft") this.keys.crouch = false
                else this.keys[e.key.toLowerCase()] = false
            }
        })
        document.addEventListener('mousemove', (event) => {
            const sensitivity = 0.002;
            if (this.gameActive) {
                this.cameraRotation.theta -= event.movementX * sensitivity;
                this.cameraRotation.phi -= event.movementY * sensitivity;
            }
        });
        document.addEventListener("wheel", (e) => {
            this.targetDistance += e.deltaY * 5;
            this.targetDistance = Math.min(Math.max(0.49, this.targetDistance), 5);
        });

        document.addEventListener("mousedown", (e) => {
            if(e.button === 0) {
                this.playerClass.shoot()
            }
        })
    }

    updateCamera() {
        // 1. Smoothly transition the distance
        this.currentDistance = this.targetDistance;
        this.isFPS = this.currentDistance <= 0.5;

        const playerPos = this.playerMesh.position.clone();
        const headHeight = 1.6; 
        const shoulderWidth = 1.7;
        const verticalOffset = 0.2; 

        this.cameraRotation.phi = Math.max(0.1, Math.min(this.cameraRotation.phi, 9 * Math.PI /13));

        if (this.isFPS) {
            this.playerMesh.layers.set(1); // Hide head/body

            this.camera.position.set(playerPos.x, playerPos.y, playerPos.z);
            
            const lookAtVector = new THREE.Vector3(
                Math.sin(this.cameraRotation.phi) * Math.sin(this.cameraRotation.theta),
                Math.cos(this.cameraRotation.phi),
                Math.sin(this.cameraRotation.phi) * Math.cos(this.cameraRotation.theta)
            ).multiplyScalar(-1);
            this.camera.lookAt(this.camera.position.clone().add(lookAtVector));

        } else {
            this.playerMesh.layers.set(0);

            const orbitPos = new THREE.Vector3(
                this.currentDistance * Math.sin(this.cameraRotation.phi) * Math.sin(this.cameraRotation.theta),
                this.currentDistance * Math.cos(this.cameraRotation.phi),
                this.currentDistance * Math.sin(this.cameraRotation.phi) * Math.cos(this.cameraRotation.theta)
            );

            const headPoint = playerPos.clone().add(new THREE.Vector3(0, headHeight, 0));
            this.camera.position.copy(headPoint).add(orbitPos);

            // Calculate "Right" and "Up" for the Shoulder Rig
            const cameraDir = new THREE.Vector3().subVectors(this.camera.position, headPoint).normalize();
            const rightSide = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), cameraDir).normalize();
            
            // Apply the Shoulder Rig offsets
            this.camera.position.add(rightSide.multiplyScalar(shoulderWidth));
            this.camera.position.y += verticalOffset;

            // Aim point: We look at a point in front of the character, not at the character
            const aimLookAt = headPoint.clone().add(
                cameraDir.clone().multiplyScalar(-10) // Look 10 units forward
            );
            this.camera.lookAt(aimLookAt);
        }
    }

    update(gameActive) {
        this.gameActive = gameActive
        if (!this.gameActive) {
            this.keys = this.defaultKeys
        }
        return this.keys
    }
}