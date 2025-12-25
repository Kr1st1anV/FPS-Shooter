import * as THREE from "three"

export class PlayerControls {
    constructor(camera, scene, player) {
        this.gameActive = false
        this.camera = camera
        this.scene = scene
        this.player = player
        
        this.defaultKeys = {w: false, s: false, a: false, d:false, space:false, shift:false}

        this.keys = this.defaultKeys
        
        this.cameraRotation = { theta: 0, phi: Math.PI / 2.5}
    
        this.controls()
    }

    controls() {
        document.addEventListener("keydown", (e) => {
            if (this.gameActive) {
                if(e.code == "Space") this.keys.space = true
                if (e.code == "ShiftLeft") this.keys.shift = true
                else this.keys[e.key.toLowerCase()] = true
            }
        })

        document.addEventListener("keyup", (e) => {
            if (this.gameActive) {
                if(e.code == "Space") this.keys.space = false
                if(e.code == "ShiftLeft") this.keys.shift = false
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
    }

    updateCamera() {
            const cameraOffset = new THREE.Vector3();
            const distance = 4 // Distance from player
            if (this.cameraRotation.phi < 0.1) this.cameraRotation.phi = Math.max(this.cameraRotation.phi, 0.1)
            if (this.cameraRotation.phi > (- 0.1 + 7 * Math.PI / 12 )) this.cameraRotation.phi =  Math.min(this.cameraRotation.phi, -0.1 + 7 * Math.PI / 12)
            // 1. Calculate the offset using Spherical Coordinates
            cameraOffset.x = distance * Math.sin(this.cameraRotation.phi) * Math.sin(this.cameraRotation.theta);
            cameraOffset.y = distance * Math.cos(this.cameraRotation.phi);
            cameraOffset.z = distance * Math.sin(this.cameraRotation.phi) * Math.cos(this.cameraRotation.theta);

            // 2. Set camera position relative to player
            this.camera.position.copy(this.player.position).add(cameraOffset);

            // 3. Make the camera look at the player
            this.camera.lookAt(this.player.position);
    }   

    update(gameActive) {
        this.gameActive = gameActive
        if (!this.gameActive) {
            this.keys = this.defaultKeys
        }
        return this.keys
    }
}