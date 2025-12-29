import * as THREE from "three"
import RAPIER from '@dimforge/rapier3d-compat';
import gsap from "gsap"
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

        this.jumpStrength = 11.0
        this.gravityConstant = -35
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

        //Gun sway
        this.prevCameraRotation = new THREE.Euler().copy(this.camera.rotation);
        this.rotationDelta = new THREE.Vector2();
        this.jumpOffset = 0;

        this.wasGrounded = true

        // Define your "Resting Position" (The gun's home)
        this.gunBasePos = new THREE.Vector3(0.16,-0.18,-0.3);
        //Gun recoil
        // Add to your constructor
        this.recoilOffset = new THREE.Vector3();
        this.recoilVelocity = new THREE.Vector3();
    }

    async buildChar() {
        this.charBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0,30,0)
        this.charBody = this.world.createRigidBody(this.charBodyDesc)

        this.charColliderDesc = RAPIER.ColliderDesc.capsule(this.currentHeight/2, this.radius).setCollisionGroups(0x00010002)
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

    applyWeaponSway(delta) {
        if (!this.gun) return;

        this.jumpOffset = THREE.MathUtils.lerp(this.jumpOffset, 0, 0.3)

        let bobX = 0;
        let bobY = 0;
        if (this.headBob) {
            this.headBobTimer += delta * 12; 
            bobX = Math.sin(this.headBobTimer * 0.5) * 0.015;
            bobY = Math.cos(this.headBobTimer) * 0.01;
        }
        this.gun.position.x = THREE.MathUtils.lerp(
            this.gun.position.x, 
            this.gunBasePos.x + bobX, 
            0.11
        );
        this.gun.position.y = THREE.MathUtils.lerp(
            this.gun.position.y, 
            this.gunBasePos.y + bobY - this.jumpOffset, 
            0.11
        );
    }

    getMuzzleWorldPosition() {
        const muzzleOffset = new THREE.Vector3(0, 0.08, -0.5); //(Right/Left, Up/Down, Forward/Back)
        
        this.gun.updateMatrixWorld(true);
        const worldMuzzle = muzzleOffset.applyMatrix4(this.gun.matrixWorld);
        
        return worldMuzzle;
    }

    shoot() {
        if (!this.gun) return;

        const muzzlePos = this.getMuzzleWorldPosition()
        const camDir = new THREE.Vector3();
        const camPos = new THREE.Vector3();
        this.camera.getWorldPosition(camPos);
        this.camera.getWorldDirection(camDir);

        const bulletRay = new RAPIER.Ray(camPos, camDir);

        const hit = this.world.castRayAndGetNormal(bulletRay, 
                                        1000, 
                                        true,
                                        undefined,
                                        undefined,
                                        undefined,
                                        this.charBody);

        const targetPoint = new THREE.Vector3();

        if (hit && !isNaN(hit.timeOfImpact)) {
            targetPoint.copy(camPos).add(camDir.clone().multiplyScalar(hit.timeOfImpact));

            const hitNormal = new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z)

            this.createImpactDot(targetPoint, hitNormal)
        } else {
            targetPoint.copy(camPos).add(camDir.clone().multiplyScalar(100));
        }
        this.createBulletTracer(muzzlePos, targetPoint);

        this.recoilVelocity.z += 0.15; // Kick back
        this.recoilVelocity.y += 0.08; // Kick up
        this.recoilVelocity.x += (Math.random() - 0.5) * 0.05; // Random horizontal jitter
    }

    createImpactDot(point, normal) {
        const geometry = new THREE.CircleGeometry(0.04, 8);
        const material = new THREE.MeshBasicMaterial({ 
            color: 0x000000, 
            transparent: true, 
            opacity: 0.9 
        });
        const dot = new THREE.Mesh(geometry, material);

        dot.position.copy(point).add(normal.clone().multiplyScalar(0.01));
        dot.lookAt(point.clone().add(normal));
        this.scene.add(dot);

        // GSAP Timeline: Wait 3 seconds, then fade out over 2 seconds
        gsap.to(material, {
            opacity: 0,
            delay: 8,        // Stay solid for 3 seconds
            duration: 1,     // Then take 2 seconds to fade
            onComplete: () => {
                this.scene.remove(dot);
                geometry.dispose();
                material.dispose();
            }
        });
    }

    createBulletTracer(start, end) {
        const travelDistance = start.distanceTo(end);
        if (travelDistance < 0.1) return;

        // Create a simple white tracer (cylinder)
        const tracerLength = 2.0;
        const geometry = new THREE.CylinderGeometry(0.01, 0.01, tracerLength, 5);
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: false });
        const tracer = new THREE.Mesh(geometry, material);

        // Initial setup: place at muzzle and point to target
        tracer.position.copy(start);
        tracer.lookAt(end);
        tracer.rotateX(Math.PI / 2); // Align cylinder axis
        this.scene.add(tracer);

        const bulletSpeed = 120; // Units per second
        let distanceCovered = 0;
        let lastTime = performance.now();

        const animate = (currentTime) => {
            const deltaTime = (currentTime - lastTime) / 1000;
            lastTime = currentTime;

            distanceCovered += bulletSpeed * deltaTime;
            const progress = distanceCovered / travelDistance;

            // STOP LOGIC: If progress >= 1, the bullet hit the collider
            if (progress >= 1.0) {
                this.scene.remove(tracer);
                geometry.dispose();
                material.dispose();
                return; 
            }

            // Move the bullet along the path
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
        let speed = (keys.shift) ? 7.0 : 5.0

        if (keys.shooting) this.shoot()

        this.applyWeaponSway(delta)

        const normalFOV = 75
        const sprintFOV = 80
        let targetFOV = (keys.shift) ? sprintFOV : normalFOV
        
        if (Math.abs(this.camera.fov - targetFOV) > 0.01) {
            this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFOV, 0.25);
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
                this.jumpOffset = -0.15;
            } else {
                this.playerVelocity.y = Math.max(0, this.playerVelocity.y)
            }
        } else {
            // Normal Gravity
            document.querySelector('.crosshair').classList.add('moving');
            this.playerVelocity.y += this.gravityConstant * delta
        }

        // Example landing detection logic
        if (isGround && !this.wasGrounded) {
            this.jumpOffset = 0.3; // Smaller dip for landing
        }
        this.wasGrounded = isGround;

        this.headBob = (movement.length() !== 0 && isGround)

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