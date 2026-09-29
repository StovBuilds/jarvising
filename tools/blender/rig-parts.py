# Inside the Rig — Blender PARTS LIBRARY for the hero parts of the
# procedural gaming-PC model in src/rig/ (jarvising entry 003).
#
# CONTRACT (this is what makes the swap safe):
#   • One mesh object per (part, material), NAMED "<libId>__<matKey>" where
#     matKey is a key of MAT in src/rig/parts/prims.ts, or the special key "accent" (the
#     runtime substitutes an emissive material in the page's accent colour).
#   • Every part is authored in the SAME LOCAL FRAME as the primitive it
#     replaces, so the runtime drops the geometry in with an identity
#     transform. Nothing is re-centred and nothing is rescaled.
#   • Units are MILLIMETRES, 1 Blender unit = 1 mm.
#   • Coordinates are written in three.js's frame (+Y up, +Z case front,
#     +X glass side). Blender is Z-up and the glTF exporter maps
#     (x, y, z)_blender → (x, z, −y)_gltf, so B() writes a three (X, Y, Z) as
#     the Blender point (X, −Z, Y). EVERY coordinate goes through B().
#   • Materials are NOT exported (export_materials='NONE'); the runtime
#     assigns MAT.* by mesh name. Normals are kept, UVs are not needed.
#
#   node ~/bin/blender-run.mjs tools/blender/rig-parts.py \
#       --expect public/models/rig-parts.glb \
#       -- --out public/models/rig-parts.glb [--previews DIR]
import argparse
import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--out", required=True)
ap.add_argument("--previews")
args = ap.parse_args(argv)

bpy.ops.wm.read_factory_settings(use_empty=True)
SC = bpy.context.scene
if SC.world is None:
    SC.world = bpy.data.worlds.new("World")

PARTS = []          # every object that gets exported
GROUPS = {}         # libId -> [objects] (for previews)


# ── frame + object helpers ─────────────────────────────────────────────────

def B(x, y, z):
    """three (X, Y, Z) → Blender location."""
    return (x, -z, y)


def deselect_all():
    for ob in bpy.data.objects:
        ob.select_set(False)


def finish(o):
    """Apply modifiers + transforms so the object's origin is the world origin
    and its vertices sit at their authored local coordinates."""
    deselect_all()
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    for m in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    o.select_set(False)
    return o


def join_as(objs, name):
    objs = [finish(o) for o in objs]
    deselect_all()
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    o.data.name = name
    deselect_all()
    return o


def smooth(o, deg=35.0):
    deselect_all()
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    if hasattr(bpy.ops.object, "shade_smooth_by_angle"):
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(deg))
    else:
        bpy.ops.object.shade_flat()
    o.select_set(False)
    return o


def mesh_from(name, verts3, faces):
    """Build a mesh from three-space vertices; normals recalculated outward."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([B(*v) for v in verts3], [], faces)
    me.validate(verbose=False)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    return ob


def box3(name, x0, x1, y0, y1, z0, z1, bevel=0.0, segs=1, angle=30.0):
    """Axis-aligned box given by three-space extents."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=B((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    o = bpy.context.active_object
    o.name = name
    o.scale = (x1 - x0, z1 - z0, y1 - y0)   # Blender (X, Y, Z) ← three (dx, dz, dy)
    deselect_all()
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.select_set(False)
    if bevel > 0:
        m = o.modifiers.new("bev", "BEVEL")
        m.width = bevel
        m.segments = segs
        m.limit_method = "ANGLE"
        m.angle_limit = math.radians(angle)
    return o


def cone_y(name, r_bottom, r_top, depth, at, verts=48):
    """Cone/cylinder whose axis is three +Y (Blender +Z)."""
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r_bottom, radius2=r_top,
                                    depth=depth, location=B(*at))
    o = bpy.context.active_object
    o.name = name
    return o


def cut(target, cutters):
    """Difference `cutters` out of `target`, then bake the whole modifier stack."""
    for c in cutters:
        finish(c)
        m = target.modifiers.new("bool", "BOOLEAN")
        m.object = c
        m.operation = "DIFFERENCE"
        m.solver = "EXACT"
    finish(target)
    for c in cutters:
        bpy.data.objects.remove(c, do_unlink=True)
    return target


def loft_z(name, stations):
    """Sweep closed (x, y) profiles along three Z. stations: [(z, [(x, y), ...])]."""
    n = len(stations[0][1])
    verts, faces = [], []
    for (z, prof) in stations:
        assert len(prof) == n, "loft profiles must share a point count"
        for (x, y) in prof:
            verts.append((x, y, z))
    for s in range(len(stations) - 1):
        a, b = s * n, (s + 1) * n
        for i in range(n):
            j = (i + 1) % n
            faces.append((a + i, a + j, b + j, b + i))
    faces.append(tuple(range(n)))
    faces.append(tuple(range((len(stations) - 1) * n, len(stations) * n)))
    return mesh_from(name, verts, faces)


def prism_x(name, poly_yz, x0, x1):
    """Extrude a closed (y, z) polygon along three X."""
    n = len(poly_yz)
    verts = [(x0, y, z) for (y, z) in poly_yz] + [(x1, y, z) for (y, z) in poly_yz]
    faces = []
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    faces.append(tuple(range(n)))
    faces.append(tuple(range(n, 2 * n)))
    return mesh_from(name, verts, faces)


def lathe(name, profile, segs=24):
    """Revolve a (radius, z) profile about the three-Z axis (the fan axis)."""
    verts, faces, idx = [], [], []
    for (r, z) in profile:
        if abs(r) < 1e-9:
            idx.append(("p", len(verts)))
            verts.append((0.0, 0.0, z))
        else:
            idx.append(("r", len(verts)))
            for k in range(segs):
                a = 2 * math.pi * k / segs
                verts.append((r * math.cos(a), r * math.sin(a), z))
    for i in range(len(profile) - 1):
        t0, b0 = idx[i]
        t1, b1 = idx[i + 1]
        if t0 == "p":
            for k in range(segs):
                faces.append((b0, b1 + k, b1 + (k + 1) % segs))
        elif t1 == "p":
            for k in range(segs):
                faces.append((b0 + k, b1, b0 + (k + 1) % segs))
        else:
            for k in range(segs):
                k1 = (k + 1) % segs
                faces.append((b0 + k, b0 + k1, b1 + k1, b1 + k))
    return mesh_from(name, verts, faces)


def emit(lib_id, mat_key, obj):
    obj.name = f"{lib_id}__{mat_key}"
    obj.data.name = obj.name
    PARTS.append(obj)
    GROUPS.setdefault(lib_id, []).append(obj)
    return obj


# ── 1. fan-rotor-<size> ────────────────────────────────────────────────────
# Replaces the `rotor` group built inside fan(size, thick) in parts/kit.ts:
# the fan lies in the XY plane, airflow along local +Z, centred on the origin.
# kit.ts drew a hub cylinder plus 9 flat pitched boxes; this is a real axial
# rotor — a domed hub and nine swept, twisted, cambered aerofoil blades.

BLADES = 9
NR = 7          # radial stations
NC = 8          # chordwise stations per surface → 2*NC-2 = 14 points per section


def _naca(t):
    """NACA 00xx half-thickness shape, normalised to a peak of 1.0."""
    if t <= 0.0:
        return 0.0
    return (0.2969 * math.sqrt(t) - 0.1260 * t - 0.3516 * t * t
            + 0.2843 * t ** 3 - 0.1036 * t ** 4) / 0.1002


def rotor_blade_mesh(size):
    hub_r = size * 0.17
    tip_r = size * 0.47 - 1.6          # 0.6 mm inside the size*0.47-1.0 limit
    root_r = hub_r * 0.90              # buried inside the hub
    span = tip_r - root_r
    ts = [0.5 * (1 - math.cos(math.pi * k / (NC - 1))) for k in range(NC)]

    def chord_ang(g):  return 0.50 + 0.12 * g - 0.06 * g * g     # angular chord
    def beta(g):       return 0.80 - 0.36 * g                    # twist, root→tip
    def tmax(g):       return size * (0.017 - 0.0075 * g)        # aerofoil thickness
    def rake(g):       return 0.34 * (g ** 1.35)                 # forward sweep
    def r_out(t):
        return tip_r - 0.09 * span * t * t - 0.015 * span * (1 - math.cos(4 * math.pi * t)) / 2

    verts, faces = [], []
    nl = 2 * NC - 2
    for b in range(BLADES):
        a0 = 2 * math.pi * b / BLADES
        start = len(verts)
        for i in range(NR):
            g = i / (NR - 1)
            ri = root_r + span * g
            ca, be, tm = chord_ang(g), beta(g), tmax(g)
            clen = ri * ca

            def pt(t, sgn):
                s = (t - 0.5) * ca
                phi = a0 + rake(g) + s
                rr = root_r + (r_out(t) - root_r) * g
                zc = -s * ri * math.tan(be)
                off = 0.045 * clen * 4 * t * (1 - t) + sgn * 0.5 * tm * _naca(t)
                etx, ety = -math.sin(phi), math.cos(phi)
                return (rr * math.cos(phi) + math.sin(be) * etx * off,
                        rr * math.sin(phi) + math.sin(be) * ety * off,
                        zc + math.cos(be) * off)

            for k in range(NC):
                verts.append(pt(ts[k], +1))
            for k in range(NC - 2, 0, -1):
                verts.append(pt(ts[k], -1))
        for i in range(NR - 1):
            a, c = start + i * nl, start + (i + 1) * nl
            for j in range(nl):
                j1 = (j + 1) % nl
                faces.append((a + j, a + j1, c + j1, c + j))
        faces.append(tuple(range(start, start + nl)))                      # root cap
        faces.append(tuple(range(start + (NR - 1) * nl, start + NR * nl)))  # tip cap
    return verts, faces


def build_rotor(size, thick):
    lib = f"fan-rotor-{size}"
    hub_r = size * 0.17
    hub_t = thick * 0.8
    zb = -hub_t / 2
    d = min(hub_r * 0.10, hub_t * 0.18)    # dome height on the front face
    zf = hub_t / 2 - d                     # …kept INSIDE thick*0.8, as kit.ts had it
    ch = min(1.2, hub_t * 0.15)            # rim chamfer
    hub = lathe(f"{lib}-hub", [
        (0.0, zf + d),
        (0.32 * hub_r, zf + d * 0.90),
        (0.62 * hub_r, zf + d * 0.62),
        (0.85 * hub_r, zf + d * 0.28),
        (hub_r - ch, zf),
        (hub_r, zf - ch),
        (hub_r, zb + ch),
        (hub_r - ch, zb),
        (0.0, zb),
    ], segs=24)
    emit(lib, "plastic", smooth(finish(hub), 40.0))

    verts, faces = rotor_blade_mesh(size)
    bl = mesh_from(f"{lib}-blades", verts, faces)
    emit(lib, "blade", smooth(finish(bl), 40.0))


for _size, _thick in [(90, 18), (100, 20), (120, 25), (135, 20), (140, 28)]:
    build_rotor(_size, _thick)


# ── 2. gpu-shroud ──────────────────────────────────────────────────────────
# GPU LOCAL FRAME (parts/gpu.ts): origin = centre of the PCIe edge connector's
# contact edge, on the PCB mid-plane. Envelope of the shroud node it replaces:
#   x ∈ [4, 141.2]   y ∈ [-71, 0.7]   z ∈ [-48, 307.6]
CARD_START, CARD_END = -48.0, 307.6
SH_X0, SH_X1 = 4.0, 140.0
SH_Y0, SH_TOP = -71.0, 0.7
PANEL_TOP = -68.5                  # underside panel is 2.5 thick
FAN_Z = (30.0, 135.0, 240.0)
FAN_X = 72.0
NOTCH_Z0, NOTCH_Z1 = 116.0, 154.0  # 16-pin connector cut-out in the glass-side wall


def gwall_profile(d, top=SH_TOP):
    """Glass-side wall cross-section (x, y); `d` is the facet step-out."""
    return [
        (137.5, SH_Y0),
        (140.0, -68.4),
        (140.0, -58.0),
        (140.0 + d, -55.0),
        (140.0 + d, -38.0),
        (140.0, -35.0),
        (138.4, -33.4),      # into the accent channel
        (138.4, -28.8),      # channel floor
        (140.0, -27.0),      # out again
        (140.0, -12.0),
        (140.6, -10.0),
        (140.6, -2.6),
        (139.2, top),
        (137.5, top),
    ]


NOTCH_PROFILE = [
    (137.5, SH_Y0),
    (140.0, -68.4),
    (140.0, -58.0),
    (140.0, -55.0),
    (140.0, -38.0),
    (140.0, -35.0),
    (138.4, -33.4),
    (138.4, -28.8),
    (140.0, -27.0),
    (140.0, -18.6),
    (138.8, -17.0),
    (137.5, -17.0),
]


def build_gpu_shroud():
    lib = "gpu-shroud"
    body = []

    # underside panel with three chamfered fan cut-outs
    panel = box3("shroud-panel", SH_X0, SH_X1, SH_Y0, PANEL_TOP, CARD_START, CARD_END,
                 bevel=0.8, angle=30.0)
    cones = [cone_y(f"cut{i}", 53.24, 50.36, 4.5, (FAN_X, -69.75, z), verts=64)
             for i, z in enumerate(FAN_Z)]
    body.append(smooth(cut(panel, cones), 35.0))

    # glass-side wall — lofted, faceted, with the accent channel and the notch
    body.append(loft_z("shroud-wall-a", [
        (CARD_START, gwall_profile(0.0)),
        (-20.0, gwall_profile(0.6)),
        (10.0, gwall_profile(1.2)),
        (60.0, gwall_profile(1.2)),
        (100.0, gwall_profile(0.5)),
        (NOTCH_Z0, gwall_profile(0.0)),
    ]))
    body.append(loft_z("shroud-wall-b", [
        (NOTCH_Z0, NOTCH_PROFILE),
        (NOTCH_Z1, NOTCH_PROFILE),
    ]))
    body.append(loft_z("shroud-wall-c", [
        (NOTCH_Z1, gwall_profile(0.0)),
        (175.0, gwall_profile(0.5)),
        (215.0, gwall_profile(1.2)),
        (265.0, gwall_profile(1.2)),
        (295.0, gwall_profile(0.6)),
        (CARD_END, gwall_profile(0.0)),
    ]))

    # slot-side wall (toward the motherboard) + the flow-through end cap
    body.append(box3("shroud-slotwall", SH_X0, 6.5, SH_Y0, -1.9, CARD_START, CARD_END,
                     bevel=1.0, angle=30.0))
    body.append(box3("shroud-endcap", SH_X0, SH_X1, SH_Y0, SH_TOP, CARD_END - 2.5, CARD_END,
                     bevel=1.0, angle=30.0))

    emit(lib, "aluDark", smooth(join_as(body, f"{lib}-body"), 35.0))

    # accent channel — one strip the length of the card, sitting in the groove
    acc = box3("shroud-accent", 138.2, 139.5, -33.2, -29.0, CARD_START + 2.0, CARD_END - 2.6)
    emit(lib, "accent", finish(acc))


build_gpu_shroud()


# ── 3. aio-block ───────────────────────────────────────────────────────────
# MACHINE FRAME (parts/aio.ts builds at absolute machine coordinates).
# Replaces box(66, 78, 78, aluDark, [-50, 454, -214.5], r=6):
#   x ∈ [-83, -17]   y ∈ [415, 493]   z ∈ [-253.5, -175.5]
# The +X face carries the LCD: the runtime still draws the screen (a plane at
# x = -16.7) and its glass cover (x ∈ [-16.6, -15.4]) — so that face stays
# clear and only the recessed bezel around it is built here.
BK_X0, BK_X1 = -83.0, -17.0
BK_Y0, BK_Y1 = 415.0, 493.0
BK_Z0, BK_Z1 = -253.5, -175.5
IN = 1.8                      # body inset behind the full-size front plate


def build_aio_block():
    lib = "aio-block"
    iy0, iy1 = BK_Y0 + IN, BK_Y1 - IN
    iz0, iz1 = BK_Z0 + IN, BK_Z1 - IN

    # front plate at full cross-section, with the display recess cut into it
    front = box3("blk-front", -20.0, BK_X1, BK_Y0, BK_Y1, BK_Z0, BK_Z1, bevel=2.0, angle=30.0)
    recess = box3("blk-recess", -18.4, -16.0, 426.6, 481.4, -250.9, -178.1)
    front = cut(front, [recess])

    # collar the accent ring sits on, then the stepped body behind it
    collar = box3("blk-collar", -22.2, -20.0, iy0, iy1, iz0, iz1, bevel=0.8, angle=30.0)
    body = box3("blk-body", BK_X0, -22.2, BK_Y0, 484.0, iz0, iz1, bevel=3.0, angle=30.0)
    deck1 = box3("blk-deck1", -62.0, -22.2, 484.0, 488.5, iz0 + 0.5, iz1 - 0.5, bevel=1.8, angle=30.0)
    deck2 = box3("blk-deck2", -44.0, -22.2, 488.5, iy1, iz0 + 1.3, iz1 - 1.3, bevel=1.4, angle=30.0)
    emit(lib, "aluDark", smooth(join_as([front, collar, body, deck1, deck2], f"{lib}-housing"), 32.0))

    # fine cooling ribs on the two Z faces, standing proud of the inset body
    ribs = []
    for i in range(13):
        x0 = -77.0 + i * 4.0
        ribs.append(box3(f"blk-rib-a{i}", x0, x0 + 2.0, 421.0, 479.0, BK_Z0 + 0.3, iz0 + 0.7,
                         bevel=0.4, angle=30.0))
        ribs.append(box3(f"blk-rib-b{i}", x0, x0 + 2.0, 421.0, 479.0, iz1 - 0.7, BK_Z1 - 0.3,
                         bevel=0.4, angle=30.0))
    emit(lib, "alu", smooth(join_as(ribs, f"{lib}-ribs"), 32.0))

    # accent ring — a frame in the step between the front plate and the collar
    ax0, ax1 = -22.0, -20.15
    oy0, oy1 = BK_Y0 + 1.1, BK_Y1 - 1.1
    oz0, oz1 = BK_Z0 + 1.1, BK_Z1 - 1.1
    ring = [
        box3("blk-acc-b", ax0, ax1, oy0, iy0, oz0, oz1),
        box3("blk-acc-t", ax0, ax1, iy1, oy1, oz0, oz1),
        box3("blk-acc-l", ax0, ax1, iy0, iy1, oz0, iz0),
        box3("blk-acc-r", ax0, ax1, iy0, iy1, iz1, oz1),
    ]
    emit(lib, "accent", join_as(ring, f"{lib}-accent"))


build_aio_block()


# ── 4. cpu-ihs ─────────────────────────────────────────────────────────────
# MACHINE FRAME (parts/board.ts): box(3.6, 40, 40, nickel, [-88.0, 454, -214.5]).
#   x ∈ [-89.8, -86.2]   y ∈ [434, 474]   z ∈ [-234.5, -194.5]
# The lid faces +X (toward the glass), so "up" for the heat spreader is +X.
IHS_CY, IHS_CZ = 454.0, -214.5


def clipped_square(half, clip):
    """40 × 40-style square with its four corners clipped — the modern desktop lid."""
    cy, cz = IHS_CY, IHS_CZ
    return [
        (cy + half, cz + half - clip), (cy + half - clip, cz + half),
        (cy - half + clip, cz + half), (cy - half, cz + half - clip),
        (cy - half, cz - half + clip), (cy - half + clip, cz - half),
        (cy + half - clip, cz - half), (cy + half, cz - half + clip),
    ]


def build_cpu_ihs():
    lib = "cpu-ihs"
    levels = [
        (clipped_square(20.0, 6.0), -89.8, -88.60),   # base flange
        (clipped_square(17.0, 5.0), -88.70, -87.60),  # stepped shoulder
        (clipped_square(13.5, 4.0), -87.70, -86.20),  # raised central platform
    ]
    objs = []
    for i, (poly, x0, x1) in enumerate(levels):
        o = prism_x(f"ihs-l{i}", poly, x0, x1)
        m = o.modifiers.new("bev", "BEVEL")
        m.width = 0.5
        m.segments = 1
        m.limit_method = "ANGLE"
        m.angle_limit = math.radians(28.0)
        objs.append(o)
    emit(lib, "nickel", smooth(join_as(objs, f"{lib}-lid"), 30.0))


build_cpu_ihs()


# ── export ─────────────────────────────────────────────────────────────────

def tri_count(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


deselect_all()
for o in bpy.data.objects:
    o.select_set(o in PARTS)
bpy.context.view_layer.objects.active = PARTS[0]
bpy.ops.export_scene.gltf(
    filepath=args.out, export_format="GLB", use_selection=True, export_apply=True,
    export_yup=True, export_cameras=False, export_lights=False,
    export_normals=True, export_texcoords=False, export_materials="NONE",
)
for o in PARTS:
    bb = [Vector(c) for c in o.bound_box]
    lo = [min(v[i] for v in bb) for i in range(3)]
    hi = [max(v[i] for v in bb) for i in range(3)]
    # Blender (x, y, z) → three (x, z, −y)
    print(f"[rig-parts] {o.name:26s} tris={tri_count(o):5d} "
          f"x[{lo[0]:8.2f},{hi[0]:8.2f}] y[{lo[2]:8.2f},{hi[2]:8.2f}] z[{-hi[1]:8.2f},{-lo[1]:8.2f}]")
print(f"[rig-parts] {len(PARTS)} meshes, {sum(tri_count(o) for o in PARTS)} triangles → {args.out}")


# ── previews ───────────────────────────────────────────────────────────────

if args.previews:
    os.makedirs(args.previews, exist_ok=True)
    SC.world.use_nodes = True
    SC.world.node_tree.nodes["Background"].inputs[0].default_value = (0.05, 0.055, 0.07, 1)
    SC.world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    cam_data = bpy.data.cameras.new("cam")
    cam = bpy.data.objects.new("cam", cam_data)
    SC.collection.objects.link(cam)
    cam_data.lens = 50
    SC.camera = cam
    key = bpy.data.lights.new("key", "SUN")
    key.energy = 5.0
    key_o = bpy.data.objects.new("key", key)
    SC.collection.objects.link(key_o)
    key_o.rotation_euler = (math.radians(55), 0, math.radians(35))
    fill = bpy.data.lights.new("fill", "SUN")
    fill.energy = 2.0
    fill_o = bpy.data.objects.new("fill", fill)
    SC.collection.objects.link(fill_o)
    fill_o.rotation_euler = (math.radians(70), 0, math.radians(-140))
    SC.render.engine = "CYCLES"
    SC.cycles.device = "CPU"
    SC.cycles.samples = 40
    SC.render.resolution_x = 560
    SC.render.resolution_y = 420
    SC.render.film_transparent = False
    SC.view_settings.view_transform = "Standard"

    for lib_id, objs in GROUPS.items():
        for o in PARTS:
            o.hide_render = o not in objs
        pts = [Vector(c) for o in objs for c in o.bound_box]
        lo = Vector([min(p[i] for p in pts) for i in range(3)])
        hi = Vector([max(p[i] for p in pts) for i in range(3)])
        mid = (lo + hi) / 2
        rad = max((hi - lo).length / 2, 1.0)
        for tag, dv in (("", (0.85, -1.5, 0.72)), ("-b", (1.7, -0.55, 0.30))):
            d = Vector(dv).normalized()
            cam.location = mid + d * rad * 3.4
            cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
            SC.render.filepath = os.path.join(args.previews, f"{lib_id}{tag}.png")
            bpy.ops.render.render(write_still=True)
            print(f"[rig-parts] preview {lib_id}{tag}.png")
    for o in PARTS:
        o.hide_render = False
