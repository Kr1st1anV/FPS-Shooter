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
        const sun = new THREE.DirectionalLight(0xffffff, 2)
        sun.position.set(0,150,0)
        sun.target.position.set(0,0,0)
        sun.castShadow = false
        // sun.shadow.mapSize.width = 512
        // sun.shadow.mapSize.height = 512
        // sun.shadow.camera.near = 1.0
        // sun.shadow.camera.far = 500.0
        // sun.shadow.camera.left = 50
        // sun.shadow.camera.right = -50
        // sun.shadow.camera.top = 50
        // sun.shadow.camera.bottom = -50
        this.scene.add(sun)

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
        const house2Color = new THREE.MeshLambertMaterial({color: 0x00ff00})
        house2.traverse((child) => {
            if (child.isMesh) {
                child.material = house2Color
            }
        })
        const house3Color = new THREE.MeshLambertMaterial({color: 0x0000ff})
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

        const posX = 0, posY = 2.05, posZ = 0;
        const rotX = Math.PI / 5.5;

        ramp.position.set(posX, posY, posZ);
        ramp.rotation.x = rotX;
        this.scene.add(ramp);

        const bodyDesc = RAPIER.RigidBodyDesc.fixed()
            .setTranslation(posX, posY, posZ)
            .setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, 0, 0)));

        const body = this.world.createRigidBody(bodyDesc);
        const colliderDesc = RAPIER.ColliderDesc.cuboid(width/2, height/2, depth/2);
        this.world.createCollider(colliderDesc, body);

        ramp.matrixAutoUpdate = false;
        ramp.updateMatrix();
        this.scene.add(floor, ramp)
    }

    update() {

    }
}