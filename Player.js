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
        this.rotationDelta = new THREE.Vector2();
        this.jumpOffset = 0;

        this.wasGrounded = true

        // Define your "Resting Position"
        this.gunBasePos = new THREE.Vector3(0.16,-0.18,-0.3);
        
        //Gun recoil
        this.recoilOffset = new THREE.Vector3();
        this.recoilVelocity = new THREE.Vector3();

        //Bullet Pattern
        // Inside your constructor
        this.isFiring = false;
        this.fireRate = 150; // Milliseconds between shots (100ms = 600 RPM)
        this.lastShotTime = 0;

        this.recoilPattern = [
            { x: 0.00, y: 0.00 }, // 1: Stem start
            { x: 0.00, y: 0.01 }, // 2: Stem
            { x: 0.00, y: 0.02 }, // 3: Stem
            { x: 0.00, y: 0.03 }, // 3: Stem
            { x: 0.00, y: 0.04 }, // 4: Center of the T-top
            // { x: 0.025, y: 0.08 }, // 5: Move Right
            // { x: 0.05, y: 0.08 }, // 6: Far Right
            // { x: -0.025, y: 0.08 },// 7: Swing back Left
            // { x: -0.05, y: 0.08 },// 8: Far Left
        ];

        this.swayDirection = 1; // Used for the infinite back-and-forth after shot 8
        this.shotCount = 0;

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

        // We multiply the velocity and offset by a factor less than 1.0 every frame
        this.recoilVelocity.multiplyScalar(0.9); // Friction
        this.recoilOffset.add(this.recoilVelocity); // Apply velocity to position
        this.recoilOffset.multiplyScalar(0.8); // Snap back to 0 (Spring)

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
            this.gunBasePos.x + bobX + this.recoilOffset.x * 0.2, 
            0.11
        );
        this.gun.position.y = THREE.MathUtils.lerp(
            this.gun.position.y, 
            this.gunBasePos.y + bobY - this.jumpOffset + this.recoilOffset.y * 0.05, 
            0.11
        );
        this.gun.position.z = THREE.MathUtils.lerp(
            this.gun.position.z, 
            this.gunBasePos.z + this.recoilOffset.z * 0.12, 
            0.9
        );
    }

    getMuzzleWorldPosition() {
        const muzzleOffset = new THREE.Vector3(0, 0.08, -0.44); //(Right/Left, Up/Down, Forward/Back)
        
        this.gun.updateMatrixWorld(true);
        const worldMuzzle = muzzleOffset.applyMatrix4(this.gun.matrixWorld);
        
        return worldMuzzle;
    }

    shoot() {
        if (!this.gun) return;
        
        // Bullet Delay
        const now = performance.now()

        if(now - this.lastShotTime < this.fireRate) return

        if (now - this.lastShotTime > 250) {
            this.shotCount = 0
            this.swayDirection = 1
        }

        this.lastShotTime = now

        let pattern; 
        let verticalKick;

        //Bullet pattern
        if (this.shotCount < this.recoilPattern.length) {
            pattern = this.recoilPattern[this.shotCount]
            verticalKick = 0.004
        } else {
            const bulletPatternWidth = 0.040
            //const bulletPatterSpeed = 0.02
            verticalKick = 0.0
            const bulletPatternX = Math.cos(this.shotCount * 0.8) * bulletPatternWidth
            pattern = {x: bulletPatternX, y: 0}
        }

        this.shotCount += 1

        const camDir = new THREE.Vector3();
        const camPos = new THREE.Vector3();
        this.camera.getWorldPosition(camPos);
        this.camera.getWorldDirection(camDir);
        camDir.normalize()

        const right = new THREE.Vector3().crossVectors(camDir, new THREE.Vector3(0, 1, 0)).normalize();
        const up = new THREE.Vector3().crossVectors(right, camDir).normalize();

        // Adjust the ray direction based on the pattern

        const tempRay = new RAPIER.Ray(camPos, camDir)
        const distanceHit =  this.world.castRay(tempRay, 
                                        1000, 
                                        true,
                                        undefined,
                                        undefined,
                                        undefined,
                                        this.charBody);
                                        
        const dist = distanceHit ? distanceHit.timeOfImpact : 100

        let distanceFactor = THREE.MathUtils.clamp(5 / dist, 0, 1.8)

        const recoilIntensity = Math.max(0.1, 0.2 * distanceFactor)
        const sprayDir = camDir.clone()
            .add(right.multiplyScalar(pattern.x * recoilIntensity))
            .add(up.multiplyScalar(pattern.y * recoilIntensity))
            .normalize();

        const horizontalKick = pattern.x * recoilIntensity / 2
        verticalKick *= 2.5 * recoilIntensity
        this.controls.applyRecoil(horizontalKick, verticalKick)

        //Random bloom
        const bloomScale = this.shotCount * 0.03; // Gets wider every shot
        const randomX = (Math.random() - 0.5) * bloomScale;
        const randomY = (Math.random() - 0.5) * bloomScale;

        sprayDir.add(right.multiplyScalar(randomX)).add(up.multiplyScalar(randomY)).normalize();

        const bulletRay = new RAPIER.Ray(camPos, sprayDir);

        const hit = this.world.castRayAndGetNormal(bulletRay, 
                                        1000, 
                                        true,
                                        undefined,
                                        undefined,
                                        undefined,
                                        this.charBody);

        const targetPoint = new THREE.Vector3();

        if (hit && !isNaN(hit.timeOfImpact)) {
            targetPoint.copy(camPos).add(sprayDir.clone().multiplyScalar(hit.timeOfImpact));

            const hitNormal = new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z)

            this.createImpactDot(targetPoint, hitNormal)
        } else {
            targetPoint.copy(camPos).add(sprayDir.clone().multiplyScalar(100));
        }

        this.recoilVelocity.z += 0.15; // Kick back
        this.recoilVelocity.y += 0.08; // Kick up
        this.recoilVelocity.x += (Math.random() - 0.5) * 0.05; // Random horizontal jitter

        this.gun.updateMatrixWorld(true); 

        // 2. NOW get the muzzle position
        const muzzlePosition = this.getMuzzleWorldPosition();

        // 3. Create the tracer
        this.createBulletTracer(muzzlePosition, targetPoint);
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
            duration: 1.5,     // Then take 2 seconds to fade
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

        const tracerLength = 3.0; 
        const geometry = new THREE.CylinderGeometry(0.005, 0.02, tracerLength, 8);
        const material = new THREE.MeshStandardMaterial({ 
            color: 0xffffff,
            emissive: 0xffcc00,
            emissiveIntensity: 5,
            transparent: true,
            blending: THREE.AdditiveBlending 
        });

        const tracer = new THREE.Mesh(geometry, material);

        // --- ALIGNMENT FIX START ---
        // 1. Position at start
        tracer.position.copy(start);

        // 2. Calculate the direction vector from start to end
        const direction = new THREE.Vector3().subVectors(end, start).normalize();

        // 3. Align the cylinder (which is Y-up by default) to the direction vector
        const axis = new THREE.Vector3(0, 1, 0); 
        tracer.quaternion.setFromUnitVectors(axis, direction);
        
        // 4. Shift the mesh so the "back" of the tracer is at the start point, not the middle
        // This ensures it doesn't look like it's spawning "behind" the gun
        tracer.translateY(tracerLength / 2);
        // --- ALIGNMENT FIX END ---

        this.scene.add(tracer);

        const bulletSpeed = 200; 
        let distanceCovered = 0;
        let lastTime = performance.now();

        const animate = (currentTime) => {
            const deltaTime = (currentTime - lastTime) / 1000;
            lastTime = currentTime;

            distanceCovered += bulletSpeed * deltaTime;
            const progress = distanceCovered / travelDistance;

            if (progress >= 1.0) {
                this.scene.remove(tracer);
                geometry.dispose();
                material.dispose();
                return; 
            }

            // Move the tracer along the path
            // We use the start/end points but offset by half length to keep the "tip" on target
            const currentPos = new THREE.Vector3().lerpVectors(start, end, progress);
            tracer.position.copy(currentPos);

            if (progress > 0.8) material.opacity = 1 - ((progress - 0.8) / 0.2);

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

        if (keys.isFiring) this.shoot()

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