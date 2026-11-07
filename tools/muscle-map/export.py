# Run inside Blender: blender -b Startup.blend --python export.py -- OUT_DIR
# Exports the Z-Anatomy muscular system (every left/right muscle mesh, with its muscle and tendon
# materials) and the skeletal system as two Draco-compressed glTF binaries for the web, plus a manifest
# of every exported object (name, side, triangles, materials, bounds). Nothing is reshaped.
import bpy, json, sys, os, re, mathutils
out = sys.argv[sys.argv.index("--") + 1]
os.makedirs(out, exist_ok=True)

def objects_in(prefix):
    found = []
    def walk(c, path):
        p = path + [c.name]
        if "/".join(p).startswith(prefix):
            found.extend(o for o in c.all_objects if o.type == "MESH")
            return
        for ch in c.children:
            walk(ch, p)
    walk(bpy.context.scene.collection, [])
    return list(dict.fromkeys(found))

sets = {
    "muscles": [o for o in objects_in("Scene Collection/4: Muscular system") if re.search(r"\.(l|r)$", o.name)],
    "skeleton": [o for o in objects_in("Scene Collection/1: Skeletal system") if re.search(r"\.(l|r|t|j)$", o.name) or "." not in o.name],
}
keep = set(o.name for v in sets.values() for o in v)
# free memory: remove everything else before exporting
for o in list(bpy.data.objects):
    if o.name not in keep:
        bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.outliner.orphans_purge(do_recursive=True)
print("kept", {k: len(v) for k, v in sets.items()}, flush=True)
# the atlas's shader node trees trip the glTF exporter; the web page restyles everything anyway, so keep
# each material only as a name (muscle vs tendon) with a flat colour
for m in bpy.data.materials:
    m.use_nodes = False

manifest = {}
for key, objs in sets.items():
    objs = [bpy.data.objects[n] for n in [o.name for o in objs] if n in bpy.data.objects]
    rows = []
    for o in objs:
        o.hide_render = False; o.hide_viewport = False
        try: o.hide_set(False)
        except RuntimeError: pass
        bb = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
        rows.append({"name": o.name, "tris": sum(len(p.vertices) - 2 for p in o.data.polygons),
                     "materials": [m.name for m in o.data.materials if m],
                     "min": [round(min(v[i] for v in bb), 4) for i in range(3)], "max": [round(max(v[i] for v in bb), 4) for i in range(3)]})
    manifest[key] = rows
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(out, f"{key}.glb"), export_format="GLB", use_selection=True,
        export_apply=True, export_yup=True, export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14, export_draco_normal_quantization=10, export_draco_texcoord_quantization=12,
        export_materials="EXPORT", export_extras=False, export_animations=False, export_skins=False, export_morph=False)
    print("exported", key, len(objs), flush=True)
json.dump(manifest, open(os.path.join(out, "manifest.json"), "w"), indent=1)
print("done", flush=True)
