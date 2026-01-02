import * as THREE from "three";
import RAPIER from '@dimforge/rapier3d-compat';
import gsap from "gsap";

export class WeaponSystem {
    constructor(scene, world, camera, player) {
        this.scene = scene;
        this.world = world;
        this.camera = camera;
        this.player = player
        this.charBody = player.charBody;

        this.weapons = [];

        this.fireRate = 150;
        this.lastShotTime = 0;
        this.shotCount = 0;
        this.ammoLeft = 30
        this.fullAmmo = 30
        this.isReloading = false;

        // Assets
        this.jaggedTexture = this.createJaggedMuzzleTexture();

        const flashCanvas = document.getElementById('muzzle-flash-canvas');
        this.muzzleFlashTexture = new THREE.CanvasTexture(flashCanvas);
        // Replace PointLight with SpotLight
        this.muzzleLight = new THREE.SpotLight(0xffaa00, 5); // Color and Intensity
        this.muzzleLight.angle = Math.PI / 4; // Width of the beam (45 degrees)
        this.muzzleLight.penumbra = 0.3;      // Softness of the edges
        this.muzzleLight.decay = 2;           // How fast light dims with distance
        this.muzzleLight.distance = 0;       // How far the light reaches
        this.muzzleLight.visible = false;

        // Important: The light needs a target to know which way to shine
        this.muzzleLightTarget = new THREE.Object3D();
        this.scene.add(this.muzzleLight);
        this.scene.add(this.muzzleLightTarget);
        this.muzzleLight.target = this.muzzleLightTarget;

        // Fixed Recoil Pattern (The path the gun kicks)
        this.recoilPattern = [
            { x: 0.00, y: 0.00 }, { x: 0.00, y: 0.01 },
            { x: 0.00, y: 0.02 }, { x: 0.01, y: 0.03 },
            { x: -0.01, y: 0.04 }
        ];
    }

    updateUI() {
        const currentAmmoEl = document.getElementById('current-ammo');
        const totalAmmoEl = document.getElementById('total-ammo');
        const ammoBar = document.getElementById('ammo-bar');
        const reloadPrompt = document.getElementById('reload-prompt');

        if (this.weapons[this.currentWeapon].type === "knife") {
            ammoBar.hidden = true
            currentAmmoEl.hidden = true
            totalAmmoEl.hidden = true
            reloadPrompt.hidden = true
        } else {
            ammoBar.hidden = false
            currentAmmoEl.hidden = false
            totalAmmoEl.hidden = false
            reloadPrompt.hidden = false
        }

        if (!currentAmmoEl || !ammoBar) return;

        // 1. Update Text
        currentAmmoEl.innerText = this.ammoLeft;
        totalAmmoEl.innerText = this.fullAmmo;

        // 2. Update Progress Bar
        const circumference = 2 * Math.PI * 35; // 220
        const offset = circumference - (this.ammoLeft / this.fullAmmo) * circumference;
        ammoBar.style.strokeDashoffset = offset;

        // 3. Visual Feedback for Low Ammo
        if (this.ammoLeft <= this.fullAmmo * 0.25) {
            ammoBar.style.stroke = "#ff3366"; // Turn red when low
            reloadPrompt.style.opacity = "1";
        } else {
            ammoBar.style.stroke = "#00ffcc"; // Neon Cyan
            reloadPrompt.style.opacity = "0";
        }

        // 4. Punch Animation on shoot (using GSAP)
        gsap.fromTo("#current-ammo", 
            { scale: 1.2, color: "#00ffcc" }, 
            { scale: 1, color: "white", duration: 0.1 }
        );
    }

    createJaggedMuzzleTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = 'white';
        ctx.translate(128, 128);

        // Draw several sharp "jagged" spikes
        for (let i = 0; i < 12; i++) {
            ctx.rotate((Math.PI * 2) / 12);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            // Randomize length to make it look "angry" and organic
            const length = 80 + Math.random() * 40;
            const width = 5 + Math.random() * 10;
            ctx.lineTo(-width, length * 0.2);
            ctx.lineTo(0, length);
            ctx.lineTo(width, length * 0.2);
            ctx.fill();
        }
        return new THREE.CanvasTexture(canvas);
    }

    createJaggedFlash(gun) {
        const group = new THREE.Group();
        
        // Use a sharp, bright material
        const material = new THREE.MeshBasicMaterial({
            map: this.jaggedTexture,
            transparent: true,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        const geometry = new THREE.PlaneGeometry(0.25, 0.25);

        // Create a "Cross" shape (two planes at 90 degrees)
        const p1 = new THREE.Mesh(geometry, material);
        const p2 = new THREE.Mesh(geometry, material);
        p2.rotation.y = Math.PI / 2;
        
        group.add(p1, p2);
        
        // Randomize rotation so every shot looks different
        group.rotation.z = Math.random() * Math.PI;
        
        // Position at muzzle
        group.position.set(0, 0.08, -0.5);
        gun.add(group);

        // Flash light logic
        //this.muzzleLight.visible = true;

        // Remove very quickly (30ms is best for jagged look)
        setTimeout(() => {
            gun.remove(group);
            //this.muzzleLight.visible = false;
            //this.muzzleLight.position.set(muzzle.x,muzzle.y,muzzle.z)
            // Don't dispose material here if you reuse it! 
            // Just remove the mesh.
        }, 30);
    }

    swingKnife(knife, charBody) {
        const now = performance.now();
        // Preventing spamming too fast; 400ms is a standard "fast" melee rate
        if (now - this.lastShotTime < 400) return; 
        this.lastShotTime = now;

        // We store the original idle position to return to it perfectly
        const idlePos = this.player.gunBasePos[this.currentWeapon];
        const idleRot = { x: 0, y: 0, z: 0 };

        const tl = gsap.timeline();

        // 1. ANTICIPATION (Pull back slightly)
        tl.to(knife.position, {
            x: idlePos.x + 0.1,
            y: idlePos.y + 0.1,
            z: idlePos.z + 0.1,
            duration: 0.1,
            ease: "power2.out"
        });
        tl.to(knife.rotation, {
            x: -0.2,
            y: 0.2,
            duration: 0.1
        }, "-=0.1");

        // 2. THE SLASH (The Arc)
        // We move from right-top to left-bottom while pushing forward
        tl.to(knife.position, {
            x: idlePos.x - 0.8, // Move across the screen to the left
            y: idlePos.y - 0.2, // Move downward
            z: idlePos.z - 0.6, // Thrust forward
            duration: 0.15,
            ease: "expo.out"
        });

        // Twist the blade during the slash
        tl.to(knife.rotation, {
            x: 1.2,        // Tilt blade down
            y: -Math.PI / 3, // Rotate sideways
            z: -0.5,       // Roll the wrist
            duration: 0.15,
            ease: "expo.out"
        }, "-=0.15");

        // 3. RECOVERY (Return to idle)
        tl.to(knife.position, {
            x: idlePos.x,
            y: idlePos.y,
            z: idlePos.z,
            duration: 0.4,
            ease: "back.out(1.2)" // A slight bounce makes it feel weighty
        });

        tl.to(knife.rotation, {
            x: idleRot.x,
            y: idleRot.y,
            z: idleRot.z,
            duration: 0.4,
            ease: "power2.inOut"
        }, "-=0.4");

        // HIT DETECTION (Perform the raycast exactly when the slash is mid-way)
        setTimeout(() => {
            this.performMeleeRaycast(charBody);
        }, 100);
    }

    performMeleeRaycast(charBody) {
        const camPos = new THREE.Vector3();
        const camDir = new THREE.Vector3();
        this.camera.getWorldPosition(camPos);
        this.camera.getWorldDirection(camDir);

        const knifeRay = new RAPIER.Ray(camPos, camDir);
        // 2.5 units is a generous "gaming" reach for a knife
        const hit = this.world.castRay(knifeRay, 2.5, true, undefined, undefined, undefined, charBody);

        if (hit) {
            this.showHitmarker();
            gsap.to(this.camera.position, {
                x: "+=" + (Math.random() - 0.5) * 0.05,
                y: "+=" + (Math.random() - 0.5) * 0.05,
                duration: 0.05,
                yoyo: true,
                repeat: 1
            });
        }
    }

    switchWeapon(index) {
        // 1. Hide current weapon
        const oldWeapon = this.weapons[this.currentWeapon].model;
        oldWeapon.visible = false;

        // 2. Update Index
        this.currentWeapon = index;
        const newWeapon = this.weapons[this.currentWeapon].model;
        newWeapon.visible = true;

        // 3. Trigger the Draw Animation
        this.playDrawAnimation(newWeapon);
    }

    playDrawAnimation(gun) {
        // Define the resting position (where the gun usually sits)
        const restingPos = this.player.gunBasePos[this.currentWeapon];

        if (this.weapons[this.currentWeapon].type === "knife") {
            gsap.to(gun.rotation, { y: Math.PI * 2, duration: 0.5, ease: "power2.inOut" });
            gsap.to(gun.position, { y: restingPos.y, duration: 0.4, ease: "back.out(2)" });
            return
        }
        
        // Set starting position (Below the screen and tilted)
        gun.position.set(restingPos.x, restingPos.y - 1.0, restingPos.z);
        gun.rotation.set(Math.PI / 2, 0, 0); // Tilted back

        // GSAP Animation
        const tl = gsap.timeline();

        tl.to(gun.position, {
            x: restingPos.x,
            y: restingPos.y,
            z: restingPos.z,
            duration: 0.6,
            ease: "back.out(1.5)" // Gives it that "pop" or "bounce" effect
        });

        tl.to(gun.rotation, {
            x: 0,
            y: 0,
            z: 0,
            duration: 0.5,
            ease: "power2.out"
        }, "-=0.4"); // Start rotation slightly after movement
    }

    shoot(gun, charBody, onRecoil, currentVelocity, weaponType = "gun") {
        if (!gun || this.isReloading) return;

        if (weaponType === "knife") {
            this.swingKnife(gun, charBody)
            return
        }

        if (this.ammoLeft <= 0) return
        const now = performance.now();
        if (now - this.lastShotTime < this.fireRate) return;

        // Reset shot count if player hasn't fired in a while
        if (now - this.lastShotTime > 250) this.shotCount = 0;
        this.lastShotTime = now;

        const speed = new THREE.Vector3(currentVelocity.x, 0, currentVelocity.z).length();
    
        // Define how much movement affects accuracy
        const moveErrorThreshold = 0.1; // Speed below this is considered "standing still"
        const moveErrorIntensity = 0.02; // How much the circle expands per unit of speed

        let movementBloom = 0;
        if (speed > moveErrorThreshold) {
            movementBloom = speed * moveErrorIntensity;
        }

        let pattern;
        let verticalKick;

        // 1. Determine Base Recoil Pattern
        if (this.shotCount < this.recoilPattern.length) {
            pattern = this.recoilPattern[this.shotCount];
            verticalKick = 0.004;
        } else {
            const bulletPatternWidth = 0.040;
            verticalKick = 0.0;
            pattern = { x: Math.cos(this.shotCount * 0.8) * bulletPatternWidth, y: 0.02 };
        }
        this.shotCount++;
        this.ammoLeft--;
        this.updateUI();

        // 2. Setup Camera Vectors
        const camPos = new THREE.Vector3();
        const camDir = new THREE.Vector3();
        this.camera.getWorldPosition(camPos);
        this.camera.getWorldDirection(camDir);

        const right = new THREE.Vector3().crossVectors(camDir, new THREE.Vector3(0, 1, 0)).normalize();
        const up = new THREE.Vector3().crossVectors(right, camDir).normalize();

        // 3. Distance scaling for recoil intensity
        const tempRay = new RAPIER.Ray(camPos, camDir);
        const distanceHit = this.world.castRay(tempRay, 1000, true, undefined, undefined, undefined, charBody);
        const dist = distanceHit ? distanceHit.timeOfImpact : 100;
        let distanceFactor = THREE.MathUtils.clamp(5 / dist, 0, 1.8);
        const recoilIntensity = Math.max(0.1, 0.5 * distanceFactor);

        const baseBloom = 0.001; // Natural inaccuracy even when standing
        const totalSpreadRadius = (this.shotCount * baseBloom) + movementBloom;

        // Circular Randomization (Uniform Distribution)
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.sqrt(Math.random()) * totalSpreadRadius * 0.5; 
        
        const randomX = Math.cos(angle) * radius;
        const randomY = Math.sin(angle) * radius;

        // 5. Combine Pattern + Random Spread
        const sprayDir = camDir.clone()
            .add(right.multiplyScalar((pattern.x * recoilIntensity) + randomX))
            .add(up.multiplyScalar((pattern.y * recoilIntensity) + randomY))
            .normalize();

        // 6. Execution (Raycast)
        const bulletRay = new RAPIER.Ray(camPos, sprayDir);
        const hit = this.world.castRayAndGetNormal(bulletRay, 1000, true, undefined, undefined, undefined, charBody);
        const targetPoint = new THREE.Vector3();

        if (hit && !isNaN(hit.timeOfImpact)) {
            targetPoint.copy(camPos).add(sprayDir.clone().multiplyScalar(hit.timeOfImpact));
            this.createImpactDot(targetPoint, new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z));

            this.showHitmarker()
        } else {
            targetPoint.copy(camPos).add(sprayDir.clone().multiplyScalar(100));
        }

        // Trigger visual recoil callback
        const hKick = pattern.x * recoilIntensity / 2;
        const vKick = verticalKick * 2.5 * recoilIntensity;
        onRecoil(hKick, vKick);

        // Visuals
        const muzzlePos = this.getMuzzleWorldPosition(gun);
        //this.createMuzzleFlash(gun);
        this.createJaggedFlash(gun);
        this.createBulletTracer(muzzlePos, targetPoint, currentVelocity);
    }

    showHitmarker() {
        const hm = document.getElementById('hitmarker-container');
        // Reset any ongoing animation
        gsap.killTweensOf(hm);
        
        // Snap to visible and slightly larger, then fade/shrink
        gsap.fromTo(hm, 
            { opacity: 1, scale: 1.2 }, 
            { opacity: 0, scale: 0.8, duration: 0.15, ease: "power2.out" }
        );
    }

    reload(gun, restingPos, camera, weaponType = "gun") {
        if (this.isReloading || !gun) return;
        if (this.ammoLeft === this.fullAmmo) return
        this.isReloading = true;
        this.shotCount = 0;

        const tl = gsap.timeline({
            onComplete: () => { this.isReloading = false; }
        });

        tl.to(gun.position, { 
            x: restingPos.x + 0.05, 
            y: restingPos.y - 0.5, 
            z: restingPos.z + 0.1, 
            duration: 0.4, 
            ease: "power2.inOut" 
        });
        tl.to(gun.rotation, { x: 0.4, z: 0.6, duration: 0.4 }, "-=0.4");

        tl.to(gun.position, { 
            y: restingPos.y - 0.45, 
            duration: 0.1, 
            onStart: () => {
                gsap.to(camera.position, { y: "-=0.02", duration: 0.05, yoyo: true, repeat: 1 });
            }
        });

        tl.to(gun.position, { z: restingPos.z + 0.15, duration: 0.15 });
        tl.to(gun.position, { z: restingPos.z, duration: 0.1 });

        tl.to(gun.position, { 
            x: restingPos.x, 
            y: restingPos.y, 
            z: restingPos.z, 
            duration: 0.3, 
            ease: "back.out(1.2)" 
        });
        tl.to(gun.rotation, { x: 0, z: 0, duration: 0.3 }, "-=0.3");
        this.ammoLeft = this.fullAmmo
        this.updateUI();
    }

    createMuzzleFlash(gun) {
        // 1. Position the light and its target relative to the gun
        // Place the light source at the muzzle
        this.muzzleLight.position.set(0, 0.08, -0.45); 
        // Place the target further down the barrel (forward)
        this.muzzleLightTarget.position.set(0, 0.08, -2.0); 

        // 2. Parent the light and target to the gun so they move/rotate with it
        gun.add(this.muzzleLight);
        gun.add(this.muzzleLightTarget);

        this.muzzleLight.visible = true;

        // 3. Create the Sprite (Visual Flash)
        const spriteMaterial = new THREE.SpriteMaterial({ 
            map: this.muzzleFlashTexture, 
            blending: THREE.AdditiveBlending,
            transparent: true,
            opacity: 0.7,
            depthWrite: false
        });
        const sprite = new THREE.Sprite(spriteMaterial);
        
        gun.add(sprite); 
        sprite.position.set(0, 0.08, -0.5); 
        sprite.scale.set(0.4, 0.4, 0.4);

        // 4. Quick Cleanup
        setTimeout(() => { 
            this.muzzleLight.visible = false; 
            gun.remove(sprite);
            spriteMaterial.dispose();
        }, 35);
    }

    getMuzzleWorldPosition(gun) {
        const muzzleOffset = new THREE.Vector3(0, 0.08, -0.44);
        gun.updateMatrixWorld(true);
        return muzzleOffset.applyMatrix4(gun.matrixWorld);
    }

    createImpactDot(point, normal) {
        const geometry = new THREE.CircleGeometry(0.04, 8);
        const material = new THREE.MeshBasicMaterial({ 
            color: 0x000000, 
            transparent: true, 
            opacity: 0.9,
            side: THREE.DoubleSide
        });
        const dot = new THREE.Mesh(geometry, material);

        dot.position.copy(point).add(normal.clone().multiplyScalar(0.01));
        dot.lookAt(point.clone().add(normal));
        this.scene.add(dot);

        gsap.to(material, {
            opacity: 0,
            delay: 8,
            duration: 1.5,
            onComplete: () => {
                this.scene.remove(dot);
                geometry.dispose();
                material.dispose();
            }
        });
    }

    createBulletTracer(start, end, playerVelocity) {
        const travelDistance = start.distanceTo(end);
        if (travelDistance < 0.1) return;

        const tracerLength = 2.0; 
        const geometry = new THREE.CylinderGeometry(0.005, 0.02, tracerLength, 8);
        const material = new THREE.MeshStandardMaterial({ 
            color: 0xffffff,
            emissive: 0xffcc00,
            emissiveIntensity: 5,
            transparent: true,
            blending: THREE.AdditiveBlending 
        });

        const tracer = new THREE.Mesh(geometry, material);
        
        // We clones these so the animation doesn't mutate the original muzzle/target vectors
        const currentStart = start.clone();
        const currentEnd = end.clone();
        
        tracer.position.copy(currentStart);
        const direction = new THREE.Vector3().subVectors(currentEnd, currentStart).normalize();
        const axis = new THREE.Vector3(0, 1, 0); 
        tracer.quaternion.setFromUnitVectors(axis, direction);
        tracer.translateY(tracerLength / 2);
        this.scene.add(tracer);

        const bulletSpeed = 300; 
        let distanceCovered = 0;
        let lastTime = performance.now();

        // Convert player velocity to a Three.js Vector3
        const pVel = new THREE.Vector3(playerVelocity.x, playerVelocity.y, playerVelocity.z);

        const animate = (currentTime) => {
            const deltaTime = (currentTime - lastTime) / 1000;
            lastTime = currentTime;

            // --- THE VELOCITY FIX ---
            // Every frame, we move the start and end points of the path 
            // by the same amount the player moved.
            const frameMovement = pVel.clone().multiplyScalar(deltaTime);
            currentStart.add(frameMovement);
            currentEnd.add(frameMovement);

            distanceCovered += bulletSpeed * deltaTime;
            const progress = distanceCovered / travelDistance;

            if (progress >= 1.0) {
                this.scene.remove(tracer);
                geometry.dispose();
                material.dispose();
                return; 
            }

            // Lerp between the "moving" start and end points
            const currentPos = new THREE.Vector3().lerpVectors(currentStart, currentEnd, progress);
            tracer.position.copy(currentPos);

            if (progress > 0.8) material.opacity = 1 - ((progress - 0.8) / 0.2);
            requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }

    update() {
        this.currentWeapon = this.player.currentWeapon
    }
}