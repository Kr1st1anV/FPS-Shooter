import * as THREE from "three"
import RAPIER from '@dimforge/rapier3d-compat';
import { DRACOLoader, GLTFLoader } from "three/examples/jsm/Addons.js";

export class Map  {
    constructor(scene, world) {
        this.scene = scene
        this.world = world

        this.init()
    }

    async init() {
        await RAPIER.init()

        //Lighting
        const sun = new THREE.DirectionalLight(0xffffff, 1)
        sun.position.set(-100,150,-100)
        sun.target.position.set(0,100,0)
        const sun2 = sun.clone()
        sun.position.set(100,150,100)
        sun.castShadow = true
        sun2.castShadow = true
        // sun.shadow.mapSize.width = 512
        // sun.shadow.mapSize.height = 512
        // sun.shadow.camera.near = 1.0
        // sun.shadow.camera.far = 500.0
        // sun.shadow.camera.left = 50
        // sun.shadow.camera.right = -50
        // sun.shadow.camera.top = 50
        // sun.shadow.camera.bottom = -50
        this.scene.add(sun, sun2)

        const loader = new GLTFLoader()

        const dracoLoader = new DRACOLoader()
        dracoLoader.setDecoderPath('/examples/jsm/libs/draco')
        loader.setDRACOLoader( dracoLoader )
        const houseModel = await loader.loadAsync( "/map_props/house2.glb")
        const house1 = houseModel.scene.clone()
        const house2 = houseModel.scene.clone()
        const house3 = houseModel.scene.clone()
        const house4 = houseModel.scene.clone()
        const house1Color = new THREE.MeshLambertMaterial({color: 0xff0000})
        house1.traverse((child) => {
            if (child.isMesh) {
                child.material = house1Color
            }
        })
        const house2Color = new THREE.MeshLambertMaterial({color: 0xf0fff0})
        house2.traverse((child) => {
            if (child.isMesh) {
                child.material = house2Color
            }
        })
        const house3Color = new THREE.MeshLambertMaterial({color: 0xf000ff})
        house3.traverse((child) => {
            if (child.isMesh) {
                child.material = house3Color
            }
        })
        const house4Color = new THREE.MeshLambertMaterial({color: 0xffffff})
        house4.traverse((child) => {
            if (child.isMesh) {
                child.material = house4Color
            }
        })
        house1.position.set(30,0.2,0)
        house1.rotation.y = -Math.PI/2
        house2.rotation.y = Math.PI
        house2.position.set(0,0.2,30)
        house3.position.set(-30,0.2,0)
        house3.rotation.y = Math.PI/2
        house4.position.set(0,0.2,-30)
        this.scene.add(house1, house2, house3, house4)

        //Helps for higher FPS
        house1.matrixAutoUpdate = false;
        house1.updateMatrix();
        house2.matrixAutoUpdate = false;
        house2.updateMatrix(); 
        house3.matrixAutoUpdate = false;
        house3.updateMatrix(); 
        house4.matrixAutoUpdate = false;
        house4.updateMatrix(); 


        //Ground Collision
        let groundBodyDesc = RAPIER.RigidBodyDesc.fixed()
        let groundBody = this.world.createRigidBody(groundBodyDesc)
        let groundColliderDesc = RAPIER.ColliderDesc.cuboid(50,0.1,50)
        this.world.createCollider(groundColliderDesc, groundBody)

        //Floor Visual
        const floor = new THREE.Group()
        const floorColor = new THREE.MeshLambertMaterial({color: 0x00bb00, side: THREE.DoubleSide})
        
        for(let i = 0; i < 10; i++) {
            for(let j = 0; j < 10; j++) {
                const tile = new THREE.Mesh(
                    new THREE.PlaneGeometry(10,10),
                    floorColor)
                tile.rotation.x = -Math.PI / 2
                tile.position.set(
                    -45 + i * 10,
                    0,
                    -45 + j * 10
                );

                //FPS Reduction 
                tile.material.depthWrite = true
                tile.renderOrder = -1
                tile.matrixAutoUpdate = false;
                tile.updateMatrix(); // Calculate it once manually

                floor.add(tile)
            }
        }

        //Ramp Visual
        const width = 5;
        const height = 0.4;
        const depth = 8;

        const ramp = new THREE.Mesh(
            new THREE.BoxGeometry(width, height, depth),
            new THREE.MeshLambertMaterial({ color: 0xff8f63 })
        );

        ramp.castShadow = true

        const wall = ramp.clone()

        const WposX = 0, WposY = 4, WposZ = -10;
        const WrotX = -Math.PI/2;

        wall.position.set(WposX,WposY,WposZ)
        wall.rotation.x = WrotX

        const wallDesc = RAPIER.RigidBodyDesc.fixed()
            .setTranslation(WposX, WposY, WposZ)
            .setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(WrotX, 0, 0)));

        const wallCollider = this.world.createRigidBody(wallDesc);
        const wallColliderDesc = RAPIER.ColliderDesc.cuboid(width/2, height/2, depth/2);
        this.world.createCollider(wallColliderDesc, wallCollider);

        const RposX = 0, RposY = 2.05, RposZ = 0;
        const RrotX = Math.PI / 5.5;

        ramp.position.set(RposX, RposY, RposZ);
        ramp.rotation.x = RrotX;
        this.scene.add(ramp);

        const rampDesc = RAPIER.RigidBodyDesc.fixed()
            .setTranslation(RposX, RposY, RposZ)
            .setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(RrotX, 0, 0)));

        const rampCollider = this.world.createRigidBody(rampDesc);
        const rampcolliderDesc = RAPIER.ColliderDesc.cuboid(width/2, height/2, depth/2);
        this.world.createCollider(rampcolliderDesc, rampCollider);

        ramp.matrixAutoUpdate = false;
        ramp.updateMatrix();
        wall.matrixAutoUpdate = false;
        wall.updateMatrix();
        this.scene.add(floor, ramp, wall)
    }

    update() {

    }
}