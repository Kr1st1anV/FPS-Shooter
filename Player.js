import * as THREE from "three"
import RAPIER from '@dimforge/rapier3d-compat';
import { PlayerControls } from "./PlayerControls"
import { DRACOLoader, GLTFLoader } from "three/examples/jsm/Addons.js";

await RAPIER.init()

export class Player {
    constructor(camera, scene, world) {
        this.gameActive = false
        this.camera = camera
        this.scene = scene
        this.world = world
        this.controller = this.world.createCharacterController(0.01)
        this.controller.enableSnapToGround(0.5)
        this.controller.setMaxSlopeClimbAngle(Math.PI / 3);

        this.jumpStrength = 12.0
        this.gravityConstant = -30
        this.playerVelocity = new THREE.Vector3()

        this.forwardsDirection = new THREE.Vector3()
        this.rightDirection = new THREE.Vector3()
        this.buildChar()
        this.controls = new PlayerControls(this.camera, this.scene, this.charMesh)
    }

    async buildChar() {
        const radius = 0.5
        const height = 1.0
        //kinematicPositionBased - RigidBody that can be controlled but not by external forces
        //.kinematicPositionBased().setTranslation(0,5,0)
        this.charBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0,30,0)
        this.charBody = this.world.createRigidBody(this.charBodyDesc)

        this.charColliderDesc = RAPIER.ColliderDesc.capsule(height/2, radius)
        this.charCollider = this.world.createCollider(this.charColliderDesc, this.charBody)

        this.charMesh = new THREE.Mesh(
            new THREE.CapsuleGeometry(radius, height),
            new THREE.MeshStandardMaterial( {color:0xf4fff})
        )

        this.scene.add(this.charMesh)

        const loader = new GLTFLoader();

        loader.load(
            '/gun_models/scene.gltf', 
            (gltf) => {
                const gun = gltf.scene;
                this.charMesh.add(gun)
                gun.position.set(0.55,-0.1,0)
            }
        );
    }

    lerpAngle(start, end, t) {
        let diff = end - start;
        
        // Wrap the difference so it's always between -PI and PI
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        
        return start + diff * t;
    }

    async update(delta, gameActive) {
        this.gameActive = gameActive
        if (this.lastPosition == this.charMesh.position) {
            document.querySelector('.crosshair').classList.remove('moving');
        }
        this.lastPosition = this.charMesh.position
        let keys = this.controls.update(gameActive)
        let speed = (keys.shift) ? 12.0 : 7.0
        const movement = new THREE.Vector3()

        this.camera.getWorldDirection(this.forwardsDirection)
        this.forwardsDirection.y = 0
        this.forwardsDirection.normalize()
        this.rightDirection.crossVectors(this.forwardsDirection, new THREE.Vector3(0,1,0))

        const moveForward = Number(keys.w) - (keys.s)
        const moveRight =  Number(keys.d) - (keys.a)

        if (moveForward) {
            document.querySelector('.crosshair').classList.add('moving');
            movement.x += this.forwardsDirection.x * moveForward
            movement.z += this.forwardsDirection.z * moveForward
        }

        if (moveRight) {
            document.querySelector('.crosshair').classList.add('moving');
            movement.x += this.rightDirection.x * moveRight
            movement.z += this.rightDirection.z * moveRight
        }

        movement.normalize().multiplyScalar(speed * delta)

        const isGround = this.controller.computedGrounded()

        if(isGround && keys.space) {
            document.querySelector('.crosshair').classList.add('moving');
            this.playerVelocity.y = this.jumpStrength
        } else if (!isGround) {
            document.querySelector('.crosshair').classList.add('moving');
            this.playerVelocity.y += this.gravityConstant * delta
        } else {
            this.playerVelocity.y = Math.max(0, this.playerVelocity.y)
        }

        movement.y = this.playerVelocity.y * delta

        this.controller.computeColliderMovement(this.charCollider, movement)
        const corrected = this.controller.computedMovement()

        const currentPosition = this.charBody.translation()
        this.charBody.setNextKinematicTranslation({
            x: currentPosition.x + corrected.x,
            y: currentPosition.y + corrected.y,
            z: currentPosition.z + corrected.z
        })
        this.finalPosition = this.charBody.translation()
        this.charMesh.position.x = THREE.MathUtils.lerp(this.charMesh.position.x, this.finalPosition.x, 0.7)
        this.charMesh.position.y = THREE.MathUtils.lerp(this.charMesh.position.y, this.finalPosition.y, 0.7)
        this.charMesh.position.z = THREE.MathUtils.lerp(this.charMesh.position.z, this.finalPosition.z, 0.7)

        this.gun = this.charMesh.children[0]

        const vectorFromCamera = new THREE.Vector3()
        this.camera.getWorldDirection(vectorFromCamera)
        const gunPitch = Math.asin(vectorFromCamera.y)
        const gunYaw = Math.atan2(-vectorFromCamera.x, -vectorFromCamera.z)

        this.charMesh.rotation.y = this.lerpAngle(this.charMesh.rotation.y, gunYaw, 0.15)
        this.gun.rotation.x = this.lerpAngle(this.gun.rotation.x, gunPitch, 0.15)
        //this.gun.rotation.x = this.lerpAngle(this.gun.rotation.x, gunPitch, 0.3)
        this.controls.updateCamera()
    }
}



