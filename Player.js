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
        this.controller = this.world.createCharacterController(0.05)
        this.controller.setApplyImpulsesToDynamicBodies(false);
        this.controller.setCharacterMass(1.0);
        // Ensure this isn't too small
        this.controller.setOffset(0.1);
        this.controller.enableSnapToGround(0.2)
        this.controller.setMaxSlopeClimbAngle(Math.PI / 4);

        this.jumpStrength = 12.0
        this.gravityConstant = -30
        this.playerVelocity = new THREE.Vector3()

        this.currentHeight = 1.0
        this.standingHeight = 1.0
        this.crouchHeight = 0.8
        this.radius = 0.5

        this.forwardsDirection = new THREE.Vector3()
        this.rightDirection = new THREE.Vector3()
        this.buildChar()
        this.controls = new PlayerControls(this.camera, this.scene, this.charMesh, this)
    }

    async buildChar() {
        //kinematicPositionBased - RigidBody that can be controlled but not by external forces
        //.kinematicPositionBased().setTranslation(0,5,0)
        this.charBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0,30,0)
        this.charBody = this.world.createRigidBody(this.charBodyDesc)

        this.charColliderDesc = RAPIER.ColliderDesc.capsule(this.currentHeight/2, this.radius)
        this.charCollider = this.world.createCollider(this.charColliderDesc, this.charBody)

        this.charMesh = new THREE.Mesh(
            new THREE.CapsuleGeometry(this.radius, this.currentHeight),
            new THREE.MeshLambertMaterial( {color:0xf4fff})
        )
        this.charMesh.frustumCulled = false;

        this.scene.add(this.charMesh)

        const loader = new GLTFLoader();

        loader.load(
            '/gun_models/scene.gltf', 
            (gltf) => {
                const gun = gltf.scene;
                this.charMesh.add(gun)
                gun.position.set(0.45,-0.1,0)
                gun.material = new THREE.MeshPhongMaterial( {color: 0x00aa00} )
                gun.frustumCulled = false;
            }
        );
    }

    shoot() {
        if (!this.gun) return;

        // 1. Initialize vectors
        let muzzlePos = new THREE.Vector3();

        // Force matrix updates so world positions are real numbers
        this.gun.updateMatrixWorld(true);
        this.gun.getWorldPosition(muzzlePos);
        let muzzleDirection = new THREE.Vector3()

        this.gun.getWorldDirection(muzzleDirection)
        muzzleDirection.multiplyScalar(-1)
        const addedOffset = muzzleDirection.clone().normalize()
        muzzlePos.add(addedOffset.multiplyScalar(1/1.5))
        // 2. Physics Raycast
        const bulletRay = new RAPIER.Ray(muzzlePos, muzzleDirection);
        const hit = this.world.castRay(bulletRay, 1000, true);

        const targetPoint = new THREE.Vector3();

        // 3. The NaN Guard
        // We check if the physics engine returned a valid distance
        if (hit && !isNaN(hit.toi)) {
            targetPoint.copy(muzzlePos).add(muzzleDirection.clone().multiplyScalar(hit.toi));
        } else {
            targetPoint.copy(muzzlePos).add(muzzleDirection.clone().multiplyScalar(1000));
        }
        
        this.createLineTracer(muzzlePos, targetPoint);
    }

    createLineTracer(start, end) {
        // We use a simple Line with BufferGeometry
        const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
        const material = new THREE.LineBasicMaterial({ 
            color: 0xffff00, // Red for high visibility
            transparent: true,
            opacity: 1,
            depthTest: true // Ensure it's not hidden by the gun model
        });

        const line = new THREE.Line(geometry, material);
        this.scene.add(line);

        // Fade and Remove
        let frame = 0;
        const fade = () => {
            frame++;
            material.opacity -= 0.15; // Disappears in ~7 frames (very fast)

            if (material.opacity <= 0) {
                this.scene.remove(line);
                geometry.dispose();
                material.dispose();
            } else {
                requestAnimationFrame(fade);
            }
        };
        fade();
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
        
        //Crouch Logic
        // let targetHeight = (keys.crouch) ? this.crouchHeight : this.standingHeight

        // if (targetHeight !== this.currentHeight) {
        //     this.world.removeCollider(this.charCollider, true);

        //     this.currentHeight = targetHeight;
            
        //     const newColliderDesc = RAPIER.ColliderDesc.capsule(targetHeight / 2, this.radius); 
        //     this.charCollider = this.world.createCollider(newColliderDesc, this.charBody);
        // }

        // const targetScale = targetHeight / this.standingHeight;
        // this.charMesh.scale.y = THREE.MathUtils.lerp(this.charMesh.scale.y, targetScale, 0.2);
        
        // // Adjust mesh Y offset so the "feet" stay on the ground while scaling
        // // When scale is 1, offset is 0. When scale is 0.5, offset moves it down.
        // this.charMesh.children.forEach(child => {
        //     child.scale.y = 1 / this.charMesh.scale.y;
        // });

        //Movement Logic
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

        // //Gun Rotation
        if (this.charMesh.children.length > 0) {
            this.gun = this.charMesh.children[0];
            const vectorFromCamera = new THREE.Vector3();
            this.camera.getWorldDirection(vectorFromCamera);
            const gunPitch = Math.asin(vectorFromCamera.y);
            const gunYaw = Math.atan2(-vectorFromCamera.x, -vectorFromCamera.z);

            this.charMesh.rotation.y = this.lerpAngle(this.charMesh.rotation.y, gunYaw, 0.9);
            this.gun.rotation.x = this.lerpAngle(this.gun.rotation.x, gunPitch, 0.3);
        }
        this.controls.updateCamera()
    }
}



