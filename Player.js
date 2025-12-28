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
        this.controller.setOffset(0.15);
        this.controller.enableSnapToGround(0.0)
        this.controller.setMaxSlopeClimbAngle(Math.PI / 4);

        this.jumpStrength = 12.0
        this.gravityConstant = -30
        this.playerVelocity = new THREE.Vector3()

        this.currentHeight = 1.3
        this.standingHeight = 1.3
        this.crouchHeight = 0.8
        this.radius = 0.5

        this.forwardsDirection = new THREE.Vector3()
        this.rightDirection = new THREE.Vector3()
        this.buildChar()
        this.controls = new PlayerControls(this.camera, this.scene, this.charMesh, this)

        // Head Bobbing
        this.headBob = false
        this.headBobTimer = 0
    }

    async buildChar() {
        this.charBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0,30,0)
        this.charBody = this.world.createRigidBody(this.charBodyDesc)

        this.charColliderDesc = RAPIER.ColliderDesc.capsule(this.currentHeight/2, this.radius)
        this.charCollider = this.world.createCollider(this.charColliderDesc, this.charBody)

        this.charMesh = new THREE.Mesh(
            new THREE.CapsuleGeometry(this.radius, this.currentHeight),
            new THREE.MeshLambertMaterial( {color:0xf4fff})
        )

        this.charMesh.castShadow = true
        this.charMesh.frustumCulled = false;

        this.scene.add(this.charMesh)

        const loader = new GLTFLoader();

        loader.load(
            '/gun_models/scene.gltf', 
            (gltf) => {
                const gun = gltf.scene;
                
                this.camera.add(gun); 
                this.gun = gun;

                // X: right/left, Y: up/down, Z: forward/back (negative is in front of camera)
                gun.position.set(0.16,-0.18,-0.3); 
                // gun.scale.set(0.5, 0.5, 0.5);
                
                //gun.rotation.set(0, Math.PI, 0); 
                
                gun.traverse(child => {
                    if (child.isMesh) {
                        child.frustumCulled = false;
                        child.layers.set(0)
                        //child.material.depthTest = false
                        child.renderOrder = 999
                        
                    }
                });
            }
        );
    }

    getMuzzleWorldPosition() {
        const muzzleOffset = new THREE.Vector3(0, 0.08, -1.3); //(Right/Left, Up/Down, Forward/Back)
        
        this.gun.updateMatrixWorld(true);
        const worldMuzzle = muzzleOffset.applyMatrix4(this.gun.matrixWorld);
        
        return worldMuzzle;
    }

    shoot() {
        if (!this.gun) return;

        const muzzlePos = this.getMuzzleWorldPosition()

        // Get the direction the camera is looking (Aim)
        const rayDir = new THREE.Vector3();
        this.camera.getWorldDirection(rayDir);

        // Physics Raycast from camera center for perfect aim
        const camPos = new THREE.Vector3();
        this.camera.getWorldPosition(camPos);

        const bulletRay = new RAPIER.Ray(camPos, rayDir);
        const hit = this.world.castRay(bulletRay, 1000, true);

        const targetPoint = new THREE.Vector3();

        if (hit && !isNaN(hit.toi)) {
            targetPoint.copy(camPos).add(rayDir.clone().multiplyScalar(hit.toi));
        } else {
            targetPoint.copy(camPos).add(rayDir.clone().multiplyScalar(100));
        }
        this.createBulletTracer(muzzlePos, targetPoint);
    }

    createBulletTracer(start, end) {
        const tracerLength = 1.0;
        const geometry = new THREE.CylinderGeometry(0.01, 0.01, tracerLength, 5);
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: false, blending: THREE.AdditiveBlending });
        
        const tracer = new THREE.Mesh(geometry, material);
        
        tracer.position.copy(start);
        tracer.lookAt(end);
        tracer.rotateX(Math.PI / 2);
        this.scene.add(tracer);

        const travelDistance = start.distanceTo(end);
        const bulletVelocity = 50; // Units per second (Lower = Slower)
        let distanceCovered = 0;
        let lastTime = performance.now();

        const animate = (currentTime) => {
            // Calculate time passed since last frame in seconds
            const deltaTime = (currentTime - lastTime) / 1000;
            lastTime = currentTime;

            // Calculate how far the bullet moved this frame
            distanceCovered += bulletVelocity * deltaTime;
            const progress = distanceCovered / travelDistance;

            if (progress >= 1.0) {
                this.scene.remove(tracer);
                geometry.dispose();
                material.dispose();
                return;
            }

            // Move the tracer
            tracer.position.lerpVectors(start, end, progress);

            requestAnimationFrame(animate);
        };

        requestAnimationFrame(animate);
    }

    lerpAngle(start, end, t) {
        let diff = end - start;
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
        let speed = (keys.shift) ? 10.0 : 7.0

        if (keys.shooting) this.shoot()

        const normalFOV = 75
        const sprintFOV = 85
        let targetFOV = (keys.shift) ? sprintFOV : normalFOV
        
        if (Math.abs(this.camera.fov - targetFOV) > 0.01) {
            this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFOV, 0.1);
            this.camera.updateProjectionMatrix();
        }

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

        if (isGround) {
            if (keys.space) {
                document.querySelector('.crosshair').classList.add('moving');
                this.playerVelocity.y = this.jumpStrength
            } else {
                this.playerVelocity.y = Math.max(0, this.playerVelocity.y)
            }
        } else {
            // Normal Gravity
            document.querySelector('.crosshair').classList.add('moving');
            this.playerVelocity.y += this.gravityConstant * delta
        }

        if (movement.length() !== 0 && this.playerVelocity.y == 0) this.headBob = true

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

        this.controls.updateCamera(delta)
    }
}