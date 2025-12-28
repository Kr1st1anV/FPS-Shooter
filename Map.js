import * as THREE from "three"
import RAPIER from '@dimforge/rapier3d-compat';
import { DRACOLoader, GLTFLoader } from "three/examples/jsm/Addons.js";

export class Map  {
    constructor(scene, world) {
        this.scene = scene
        this.world = world
        this.init()
    }

    // Helper function to extract geometry and create a Rapier Trimesh
    createHousePhysics(model, position, rotationY, scale) {
        let vertices = [];
        let indices = [];

        // Traverse the model to collect all mesh data
        model.traverse((child) => {
            if (child.isMesh) {
                const geometry = child.geometry;
                const positionAttribute = geometry.attributes.position;
                
                // Collect Vertices
                for (let i = 0; i < positionAttribute.count; i++) {
                    const vertex = new THREE.Vector3().fromBufferAttribute(positionAttribute, i);
                    // Apply the specific child's world scale/rotation relative to the house root
                    child.localToWorld(vertex); 
                    // Note: Since we use child.localToWorld, we should do this BEFORE moving the house to its final spot
                    // or subtract the house final position. 
                    vertices.push(vertex.x * scale, vertex.y * scale, vertex.z * scale);
                }

                // Collect Indices
                const index = geometry.index;
                const offset = (vertices.length / 3) - positionAttribute.count;
                if (index) {
                    for (let i = 0; i < index.count; i++) {
                        indices.push(index.getX(i) + offset);
                    }
                }
            }
        });

        // Create Rigid Body
        const bodyDesc = RAPIER.RigidBodyDesc.fixed()
            .setTranslation(position.x, position.y, position.z)
            .setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotationY, 0)));
        
        const body = this.world.createRigidBody(bodyDesc);

        // Create Trimesh Collider (best for complex houses/buildings)
        // Inside createHousePhysics or where you create the house collider
        const colliderDesc = RAPIER.ColliderDesc.trimesh(new Float32Array(vertices), new Uint32Array(indices))
            .setFriction(0.0)      // Remove friction so player slides down/off
            .setRestitution(0.0);  // Prevent "bouncing" off the wall
        this.world.createCollider(colliderDesc, body);
    }

    async init() {
        await RAPIER.init()

        //Lighting
        const sun = new THREE.DirectionalLight(0xffffff, 1)
        sun.position.set(-100,150,-100)
        sun.target.position.set(0,100,0)
        const sun2 = sun.clone()
        sun.position.set(100,150,100)
        sun.castShadow = false
        sun2.castShadow = false
        this.scene.add(sun, sun2)
        // sun.shadow.mapSize.width = 512
        // sun.shadow.mapSize.height = 512
        // sun.shadow.camera.near = 1.0
        // sun.shadow.camera.far = 500.0
        // sun.shadow.camera.left = 50
        // sun.shadow.camera.right = -50
        // sun.shadow.camera.top = 50
        // sun.shadow.camera.bottom = -50

        const loader = new GLTFLoader()
        const dracoLoader = new DRACOLoader()
        dracoLoader.setDecoderPath('/examples/jsm/libs/draco')
        loader.setDRACOLoader( dracoLoader )

        const houseModel = await loader.loadAsync( "/map_props/Cottage.gltf")

        // Define house configurations
        const houseConfigs = [
            { pos: new THREE.Vector3(-25, 0, -5), rot: -Math.PI/2, color: 0x664c28 , scale: 10 },
            { pos: new THREE.Vector3(-5, 0, -25), rot: Math.PI, color: 0x664c28 , scale: 10 },
            { pos: new THREE.Vector3(25, 0, 5), rot: Math.PI/2, color: 0x664c28 , scale: 10 },
            { pos: new THREE.Vector3(-25, 0, 35), rot: 0, color: 0x664c28 , scale: 10 }
        ];

        houseConfigs.forEach(config => {
            const house = houseModel.scene.clone();
            
            // Apply Materials
            const mat = new THREE.MeshLambertMaterial({ color: config.color });
            house.traverse((child) => {
                if (child.isMesh) child.material = mat;
            });

            // Set Visuals
            house.position.copy(config.pos);
            house.rotation.y = config.rot;
            house.scale.set(config.scale,config.scale,config.scale)
            this.scene.add(house);

            // Set Physics (Trimesh)
            // We pass the raw houseModel.scene for geometry and config for placement
            this.createHousePhysics(houseModel.scene, config.pos, config.rot, config.scale);

            house.matrixAutoUpdate = false;
            house.updateMatrix();
        });

        // Ground Collision
        let groundBodyDesc = RAPIER.RigidBodyDesc.fixed()
        let groundBody = this.world.createRigidBody(groundBodyDesc)
        let groundColliderDesc = RAPIER.ColliderDesc.cuboid(50,0.1,50)
        this.world.createCollider(groundColliderDesc, groundBody)

        //Floor Visual
        const ground = new THREE.Group()
        const grass = new THREE.MeshLambertMaterial({color: 0x00bb00, side: THREE.DoubleSide})
        const pavement = new THREE.MeshLambertMaterial({color: 0xc19a6b, side: THREE.DoubleSide})
        
        const groundMappings = [[0,0,0,0,0,0,0,0],
                                [0,0,0,1,0,0,0,0],
                                [0,0,0,1,0,0,0,0],
                                [0,1,1,1,0,0,0,0],
                                [0,0,0,1,1,1,1,0],
                                [0,0,0,1,0,0,0,0],
                                [0,1,1,1,0,0,0,0],
                                [0,1,0,0,0,0,0,0]]

        for(let i = 0; i < 8; i++) {
            for(let j = 0; j < 8; j++) {
                const tileColor = (groundMappings[j][i] == 0) ? grass : pavement
                const tile = new THREE.Mesh(
                    new THREE.PlaneGeometry(10,10),
                    tileColor)
                tile.rotation.x = -Math.PI / 2
                tile.position.set(
                    -35 + i * 10,
                    0,
                    -35 + j * 10
                );

                //FPS Reduction 
                tile.material.depthWrite = true
                tile.renderOrder = -1
                tile.matrixAutoUpdate = false;
                tile.updateMatrix(); // Calculate it once manually

                ground.add(tile)
            }
        }
        ground.castShadow = true
        ground.receiveShadow = true

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

        const WposX = 0, WposY = 4, WposZ = 15;
        const WrotX = -Math.PI/2;

        wall.position.set(WposX,WposY,WposZ)
        wall.rotation.x = WrotX

        const wallDesc = RAPIER.RigidBodyDesc.fixed()
            .setTranslation(WposX, WposY, WposZ)
            .setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(WrotX, 0, 0)));

        const wallCollider = this.world.createRigidBody(wallDesc);
        const wallColliderDesc = RAPIER.ColliderDesc.cuboid(width/2, height/2, depth/2);
        this.world.createCollider(wallColliderDesc, wallCollider);

        const RposX = 10, RposY = 2.05, RposZ = -10;
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
        this.scene.add(ground, ramp, wall)
    }

    update() {

    }
}