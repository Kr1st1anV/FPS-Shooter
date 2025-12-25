import * as THREE from "three"
import RAPIER from '@dimforge/rapier3d-compat';
import { PlayerControls } from "./PlayerControls"

await RAPIER.init()

export class Player {
    constructor(camera, scene, world) {
        this.gameActive = false
        this.camera = camera
        this.scene = scene
        this.world = world
        this.controller = this.world.createCharacterController(0.01)
        this.controller.enableSnapToGround(0.5)

        this.jumpStrength = 12.0
        this.gravityConstant = -30
        this.playerVelocity = new THREE.Vector3()

        this.forwardsDirection = new THREE.Vector3()
        this.rightDirection = new THREE.Vector3()
        this.buildChar()
        this.controls = new PlayerControls(this.camera, this.scene, this.charMesh)
    }

    buildChar() {
        const radius = 0.5
        const height = 1.0
        //kinematicPositionBased - RigidBody that can be controlled but not by external forces
        //.kinematicPositionBased().setTranslation(0,5,0)
        this.charBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0,30,0)
        this.charBody = this.world.createRigidBody(this.charBodyDesc)

        this.charColliderDesc = RAPIER.ColliderDesc.capsule(height/2, radius)
        this.charCollider = this.world.createCollider(this.charColliderDesc, this.charBody)

        this.controller = this.world.createCharacterController(0.01);
        this.controller.enableSnapToGround(0.5);

        this.charMesh = new THREE.Mesh(
            new THREE.CapsuleGeometry(radius, height),
            new THREE.MeshStandardMaterial( {color:0x00ff00})
        )
        this.scene.add(this.charMesh)
    }

    update(delta, gameActive) {
        this.gameActive = gameActive
        let keys = this.controls.update(gameActive)
        let speed = (keys.shift) ? 10.0 : 5.0
        const movement = new THREE.Vector3()

        this.camera.getWorldDirection(this.forwardsDirection)
        this.forwardsDirection.y = 0
        this.forwardsDirection.normalize()
        this.rightDirection.crossVectors(this.forwardsDirection, new THREE.Vector3(0,1,0))

        const moveForward = Number(keys.w) - (keys.s)
        const moveRight =  Number(keys.d) - (keys.a)

        if (moveForward) {
            movement.x += this.forwardsDirection.x * moveForward
            movement.z += this.forwardsDirection.z * moveForward
        }

        if (moveRight) {
            movement.x += this.rightDirection.x * moveRight
            movement.z += this.rightDirection.z * moveRight
        }

        // if (keys.w) {
        //     movement.x += this.forwardsDirection.x
        //     movement.z += this.forwardsDirection.z
        // }
        // if (keys.s) {
        //     movement.x -= this.forwardsDirection.x
        //     movement.z -= this.forwardsDirection.z
        // }
        // if (keys.a) {
        //     movement.x -= this.rightDirection.x
        //     movement.z -= this.rightDirection.z
        // }
        // if (keys.d) {
        //     movement.x += speed * this.rightDirection.x
        //     movement.z += speed * this.rightDirection.z
        // }

        movement.normalize().multiplyScalar(speed * delta)

        const isGround = this.controller.computedGrounded()

        if(isGround && keys.space) {
            this.playerVelocity.y = this.jumpStrength
        } else if (!isGround) {
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
        this.charMesh.position.set(this.finalPosition.x, this.finalPosition.y, this.finalPosition.z)
        //this.charMesh.rotation.y = this.camera.rotation.z

        this.controls.updateCamera()
    }
}



