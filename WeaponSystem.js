import * as THREE from "three";
import RAPIER from '@dimforge/rapier3d-compat';
import gsap from "gsap";

export class WeaponSystem {
    constructor(scene, world, camera, charBody) {
        this.scene = scene;
        this.world = world;
        this.camera = camera;
        this.charBody = charBody;

        this.fireRate = 150;
        this.lastShotTime = 0;
        this.shotCount = 0;
        this.isReloading = false;

        // Assets
        const flashCanvas = document.getElementById('muzzle-flash-canvas');
        this.muzzleFlashTexture = new THREE.CanvasTexture(flashCanvas);
        this.muzzleLight = new THREE.PointLight(0xffaa00, 15, 0);
        this.muzzleLight.visible = false;
        this.scene.add(this.muzzleLight);

        // Fixed Recoil Pattern (The path the gun kicks)
        this.recoilPattern = [
            { x: 0.00, y: 0.00 }, { x: 0.00, y: 0.01 },
            { x: 0.00, y: 0.02 }, { x: 0.01, y: 0.03 },
            { x: -0.01, y: 0.04 }
        ];
    }

    shoot(gun, charBody, onRecoil) {
        if (!gun || this.isReloading) return;

        const now = performance.now();
        if (now - this.lastShotTime < this.fireRate) return;

        // Reset shot count if player hasn't fired in a while
        if (now - this.lastShotTime > 250) this.shotCount = 0;
        this.lastShotTime = now;

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

        // 4. RANDOM BULLET SPREAD (BLOOM)
        // We use polar coordinates to ensure a circular spread pattern
        const maxBloom = 0.005; // Maximum possible spread radius
        const bloomIncr = 0.005; // How much spread increases per shot
        
        // Calculate current spread radius
        const currentSpread = Math.min(this.shotCount * bloomIncr, maxBloom);
        
        // Circular Randomization
        const angle = Math.random() * Math.PI * 2;
        // Using Math.sqrt(Math.random()) gives a uniform distribution across the circle
        const radius = Math.sqrt(Math.random()) * currentSpread; 
        
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
        } else {
            targetPoint.copy(camPos).add(sprayDir.clone().multiplyScalar(100));
        }

        // Trigger visual recoil callback
        const hKick = pattern.x * recoilIntensity / 2;
        const vKick = verticalKick * 2.5 * recoilIntensity;
        onRecoil(hKick, vKick);

        // Visuals
        const muzzlePos = this.getMuzzleWorldPosition(gun);
        this.createMuzzleFlash(muzzlePos);
        this.createBulletTracer(muzzlePos, targetPoint);
    }

    reload(gun, restingPos, camera) {
        if (this.isReloading || !gun) return;
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
    }

    createMuzzleFlash(pos) {
        this.muzzleLight.position.copy(pos);
        this.muzzleLight.visible = true;
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.muzzleFlashTexture, blending: THREE.AdditiveBlending }));
        sprite.scale.set(0.5, 0.5, 0.5);
        sprite.position.copy(pos);
        this.scene.add(sprite);
        setTimeout(() => { this.muzzleLight.visible = false; this.scene.remove(sprite); }, 40);
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
            opacity: 0.9 
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
        tracer.position.copy(start);
        const direction = new THREE.Vector3().subVectors(end, start).normalize();
        const axis = new THREE.Vector3(0, 1, 0); 
        tracer.quaternion.setFromUnitVectors(axis, direction);
        tracer.translateY(tracerLength / 2);
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

            const currentPos = new THREE.Vector3().lerpVectors(start, end, progress);
            tracer.position.copy(currentPos);
            if (progress > 0.8) material.opacity = 1 - ((progress - 0.8) / 0.2);
            requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }
}