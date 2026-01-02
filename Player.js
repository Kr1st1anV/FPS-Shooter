import * as THREE from "three"
import RAPIER from '@dimforge/rapier3d-compat';
import gsap from "gsap"
import { PlayerControls } from "./PlayerControls"
import { DRACOLoader, GLTFLoader } from "three/examples/jsm/Addons.js";
import { WeaponSystem } from "./WeaponSystem";

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

        this.gun = []
        this.currentWeapon = 0;

        this.buildChar()

        this.controls = new PlayerControls(this.camera, this.scene, this)
        this.weaponSystem = new WeaponSystem(this.scene, this.world, this.camera, this)

        // Head Bobbing
        this.headBob = false
        this.headBobTimer = 0

        //Gun sway
        this.rotationDelta = new THREE.Vector2();
        this.jumpOffset = 0;

        this.wasGrounded = true

        // Define your "Resting Position"
        this.gunBasePos = [new THREE.Vector3(0.16,-0.18,-0.3), new THREE.Vector3(0.3,-0.3,-1.5)] //new THREE.Vector3(1.25,-0.98,-1.8)

        this.gameStartGunReset = true
        
        //Gun recoil
        this.recoilOffset = new THREE.Vector3();
        this.recoilVelocity = new THREE.Vector3();
    }

    async buildChar() {
        this.charBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(Math.random() * 50 -25 ,25,Math.random() * 50 -25)
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
                gun.visible = false
                this.camera.add(gun);
                this.weaponSystem.weapons.push({ name: "AK", type: "gun", fireRate: 150, model: gun}) 
                
                this.gun.push(gun);

                // X: right/left, Y: up/down, Z: forward/back (negative is in front of camera)
                gun.position.set(this.gunBasePos[this.currentWeapon].x,this.gunBasePos[this.currentWeapon].y,this.gunBasePos[this.currentWeapon].z); 
                // gun.scale.set(0.5, 0.5, 0.5);
                
                gun.rotation.set(0, -Math.PI/2, 0); 
                
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
        loader.load(
            '/knife_model/scene.gltf', 
            (gltf) => {
                const knife = gltf.scene;
                knife.visible = false
                this.weaponSystem.weapons.push({ name: "Knife", type: "knife", fireRate: 400, model: knife}) 
                this.camera.add(knife); 
                this.gun.push(knife);

                // X: right/left, Y: up/down, Z: forward/back (negative is in front of camera)
                this.currentWeapon += 1
                knife.position.set(this.gunBasePos[this.currentWeapon].x,this.gunBasePos[this.currentWeapon].y,this.gunBasePos[this.currentWeapon].z); 
                knife.scale.set(0.5,0.5,0.5);
                
                knife.rotation.set(0, -Math.PI/2, 0); 
                
                knife.traverse(child => {
                    if (child.isMesh) {
                        child.frustumCulled = false;
                        child.layers.set(0)
                        //child.material.depthTest = false
                        child.renderOrder = 999
                        
                    }
                });
            }
        );
        this.currentWeapon = 0
    }

    applyWeaponSway(delta) {
        if (this.gun.length == 0) return;

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
        this.gun[this.currentWeapon].position.x = THREE.MathUtils.lerp(
            this.gun[this.currentWeapon].position.x, 
            this.gunBasePos[this.currentWeapon].x + bobX + this.recoilOffset.x * 0.2, 
            0.11
        );
        this.gun[this.currentWeapon].position.y = THREE.MathUtils.lerp(
            this.gun[this.currentWeapon].position.y, 
            this.gunBasePos[this.currentWeapon].y + bobY - this.jumpOffset + this.recoilOffset.y * 0.05, 
            0.11
        );
        this.gun[this.currentWeapon].position.z = THREE.MathUtils.lerp(
            this.gun[this.currentWeapon].position.z, 
            this.gunBasePos[this.currentWeapon].z + this.recoilOffset.z * 0.12, 
            0.9
        );
    }

    lerpAngle(start, end, t) {
        let diff = end - start;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        return start + diff * t;
    }

    async update(delta, gameActive) {
        if (this.gameStartGunReset && this.weaponSystem.weapons.length > 0) {
            this.weaponSystem.switchWeapon(0)
            this.gameStartGunReset = false
        }
        this.gameActive = gameActive
        if (this.lastPosition == this.charMesh.position) {
            document.querySelector('.crosshair').classList.remove('moving');
        }
        this.lastPosition = this.charMesh.position
        let keys = this.controls.update(gameActive)
        let speed = (keys.shift) ? 7.0 : 5.0

        const isFiringThisFrame = (keys.isFiring && !this.weaponSystem.isReloading) && this.weaponSystem.ammoLeft > 0
        const velocity = this.charBody.linvel()

        if (keys.isFiring) {
            this.weaponSystem.shoot(this.gun[this.currentWeapon], 
                                    this.charBody, 
                                    (hKick, vKick) => this.controls.applyRecoil(hKick, vKick),
                                    velocity,
                                    this.weaponSystem.weapons[this.currentWeapon].type
            )
        
        }

        if (keys.r) {
            this.weaponSystem.reload(this.gun[this.currentWeapon], this.gunBasePos[this.currentWeapon], this.camera, this.weaponSystem.weapons[this.currentWeapon].type);
        }

        this.applyWeaponSway(delta)

        const normalFOV = 75
        const sprintFOV = 85
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

        this.controls.updateCamera(delta, isFiringThisFrame)
        this.weaponSystem.update()
    }
}