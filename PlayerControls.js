import * as THREE from "three"

export class PlayerControls {
    constructor(camera, scene, playerMesh, player) {
        this.gameActive = true
        this.camera = camera
        this.scene = scene
        this.playerMesh = playerMesh
        this.player = player
        
        this.defaultKeys = {w: false, s: false, a: false, d:false, space:false, shift:false, crouch:false, isFiring: false}

        this.keys = this.defaultKeys
        
        this.cameraRotation = { theta: 0, phi: Math.PI / 2.5}

        //FPS
        this.targetDistance = 0.5;
        this.currentDistance = 0.5;
        this.isFPS = true;

        //Recoil
        this.recoil = { x: 0, y: 0 };
        this.targetRecoil = { x: 0, y: 0 };
        this.recoilSnappiness = 15; // Speed of the upward kick
        this.recoilReturnSpeed = 5; // Speed of the recovery
    
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
                if (e.code == "Slash") this.isFPS = !this.isFPS
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
            const sensitivity = 0.003;
            if (this.gameActive) {
                this.cameraRotation.theta -= event.movementX * sensitivity;
                this.cameraRotation.phi -= event.movementY * sensitivity;
            }
        });
        // document.addEventListener("wheel", (e) => {
        //     if (this.gameActive) {
        //         this.targetDistance += e.deltaY * 5;
        //         this.targetDistance = Math.min(Math.max(0.49, this.targetDistance), 4);
        //     }
        // });

        document.addEventListener("mousedown", (e) => {
            if(e.button === 0 && this.gameActive) {
                this.keys.isFiring = true
            }
        })

        document.addEventListener("mouseup", (e) => {
            if(e.button === 0 && this.gameActive) {
                this.keys.isFiring = false
            }
        })
    }

    applyRecoil(x, y) {
        // x affects theta (horizontal), y affects phi (vertical)
        this.targetRecoil.x += x;
        this.targetRecoil.y += y;
    }

    updateCamera(delta) {

        this.targetRecoil.x = THREE.MathUtils.lerp(this.targetRecoil.x, 0, this.recoilReturnSpeed * delta)
        this.targetRecoil.y = THREE.MathUtils.lerp(this.targetRecoil.y, 0, this.recoilReturnSpeed * delta)

        this.recoil.x = THREE.MathUtils.lerp(this.recoil.x, this.targetRecoil.x, this.recoilSnappiness * delta)
        this.recoil.y = THREE.MathUtils.lerp(this.recoil.y, this.targetRecoil.y, this.recoilSnappiness * delta)

        this.cameraRotation.phi += this.recoil.y
        this.cameraRotation.theta += this.recoil.x
        
        this.currentDistance = this.targetDistance;

        const playerPos = this.playerMesh.position.clone();
        const headHeight = 1.2; 
        const shoulderWidth = 2;
        const verticalOffset = 0.2; 

        this.targetDistance = (this.isFPS) ? 0.5 : 4

        this.cameraRotation.phi = (this.isFPS) ? Math.max(Math.PI / 180, Math.min(this.cameraRotation.phi, 15 * Math.PI / 16)) : Math.max(Math.PI / 12, Math.min(this.cameraRotation.phi, 9 * Math.PI /14));

        const orbitPos = new THREE.Vector3(
                this.currentDistance * Math.sin(this.cameraRotation.phi) * Math.sin(this.cameraRotation.theta),
                this.currentDistance * Math.cos(this.cameraRotation.phi),
                this.currentDistance * Math.sin(this.cameraRotation.phi) * Math.cos(this.cameraRotation.theta)
            );
        let headPoint, cameraDir, rightSide;
        if (this.isFPS) {
            this.playerMesh.layers.set(1); // Hide head/body

            headPoint = playerPos.clone().add(new THREE.Vector3(0, 0, 0));
            this.camera.position.copy(headPoint).add(orbitPos);

            // Calculate "Right" and "Up" for the Shoulder Rig
            cameraDir = new THREE.Vector3().subVectors(this.camera.position, headPoint).normalize();
            rightSide = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 0, 0), cameraDir).normalize();

        } else {
            this.playerMesh.layers.set(0);

            headPoint = playerPos.clone().add(new THREE.Vector3(0, headHeight, 0));
            this.camera.position.copy(headPoint).add(orbitPos);

            // Calculate "Right" and "Up" for the Shoulder Rig
            cameraDir = new THREE.Vector3().subVectors(this.camera.position, headPoint).normalize();
            rightSide = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), cameraDir).normalize();
        }

        // Apply the Shoulder Rig offsets
        // if (this.isFPS) {
        //     if (this.player.headBob) {
        //         const waveLength = Math.PI
        //         const nextStep = 1 + Math.floor(((this.player.headBobTimer + 0.000001) * 10) / waveLength)
        //         console
        //         const nextStepTime = nextStep * waveLength / 10
        //         this.player.headBobTimer = Math.min(this.player.headBobTimer + delta, nextStepTime)
        //         if (this.player.headBobTimer == nextStepTime) {
        //             this.player.headBob = false
        //         }
        //         this.camera.position.y += Math.sin(this.player.headBobTimer * 10) * 0.15//Headbob amplitude
        //     }
            
        // } else {
        if (!this.isFPS) {
            this.camera.position.add(rightSide.multiplyScalar(shoulderWidth));
            this.camera.position.y += verticalOffset
        }

        // Aim point: We look at a point in front of the character, not at the character
        const aimLookAt = headPoint.clone().add(
            cameraDir.clone().multiplyScalar(-10) // Look 10 units forward
        );
        this.camera.lookAt(aimLookAt);
    }

    update(gameActive) {
        this.gameActive = gameActive
        if (!this.gameActive) {
            this.keys = this.defaultKeys
        }
        return this.keys
    }
}