import math

import bpy
from mathutils import Vector


def create_material(name, color, roughness=0.82):
    existing = bpy.data.materials.get(name)
    if existing is not None:
        return existing
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.roughness = roughness
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    return mat


def assign_material(obj, material):
    if material is not None:
        obj.data.materials.append(material)
    return obj


def move_to_collection(obj, collection):
    for owner in list(obj.users_collection):
        owner.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def parent_to(obj, parent):
    if parent is None:
        return obj
    obj.parent = parent
    obj.matrix_parent_inverse = parent.matrix_world.inverted()
    return obj


def create_group(name, collection, parent=None):
    group = bpy.data.objects.new(name, None)
    collection.objects.link(group)
    parent_to(group, parent)
    return group


def apply_bevel(obj, width=0.04, segments=3):
    if width <= 0:
        return
    modifier = obj.modifiers.new("Edge Chamfer", "BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def add_box(
    name,
    size,
    location,
    bevel=0.04,
    material=None,
    rotation=(0.0, 0.0, 0.0),
):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = size
    obj.rotation_euler = rotation
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    apply_bevel(obj, bevel)
    assign_material(obj, material)
    return obj


def add_cylinder(
    name,
    radius,
    depth,
    location,
    vertices=32,
    bevel=0.02,
    material=None,
    rotation=(0.0, 0.0, 0.0),
):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    apply_bevel(obj, min(bevel, radius * 0.12, depth * 0.12))
    assign_material(obj, material)
    return obj


def add_sphere(name, radius, location, material=None, segments=20, rings=10):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        radius=radius,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    assign_material(obj, material)
    return obj


def add_pipe_segment(name, start, end, radius, material=None, vertices=20):
    start = Vector(start)
    end = Vector(end)
    axis = end - start
    if axis.length < 0.001:
        return None
    rotation = Vector((0.0, 0.0, 1.0)).rotation_difference(
        axis.normalized(),
    ).to_euler()
    return add_cylinder(
        name,
        radius,
        axis.length,
        tuple((start + end) / 2),
        vertices,
        0.0,
        material,
        rotation,
    )


def add_curve_pipe(name, points, radius, material=None, resolution=8):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = resolution
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    curve.resolution_u = 4
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, value in zip(spline.bezier_points, points):
        point.co = value
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    assign_material(obj, material)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    return bpy.context.object


def join_parts(parts, root_name):
    parts = [part for part in parts if part is not None]
    if not parts:
        raise ValueError(f"cannot join empty part list: {root_name}")
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    joined = bpy.context.object
    joined.name = root_name
    return joined


def add_railing(
    name,
    start,
    end,
    height,
    material=None,
    z_base=0.0,
    post_spacing=1.8,
):
    start_x, start_y = start
    end_x, end_y = end
    dx = end_x - start_x
    dy = end_y - start_y
    length = max((dx * dx + dy * dy) ** 0.5, 0.001)
    count = max(2, int(length / post_spacing) + 1)
    parts = []
    for index in range(count):
        t = index / (count - 1)
        x = start_x + dx * t
        y = start_y + dy * t
        parts.append(add_box(
            f"{name}.Post.{index:02d}",
            (0.07, 0.07, height),
            (x, y, z_base + height / 2),
            0.008,
            material,
        ))
    angle = -__import__("math").atan2(dy, dx)
    for index, rail_height in enumerate((0.55, height)):
        parts.append(add_box(
            f"{name}.Rail.{index:02d}",
            (length, 0.055, 0.055),
            (
                start_x + dx / 2,
                start_y + dy / 2,
                z_base + rail_height,
            ),
            0.006,
            material,
            rotation=(0.0, 0.0, angle),
        ))
    return join_parts(parts, name)


def add_ladder(name, x, y, height, material=None, z_base=0.0):
    parts = [
        add_box(
            f"{name}.Stringer.L",
            (0.055, 0.055, height),
            (x - 0.24, y, z_base + height / 2),
            0.004,
            material,
        ),
        add_box(
            f"{name}.Stringer.R",
            (0.055, 0.055, height),
            (x + 0.24, y, z_base + height / 2),
            0.004,
            material,
        ),
    ]
    rung_count = max(2, int(height / 0.3))
    for index in range(1, rung_count):
        z = z_base + index * height / rung_count
        parts.append(add_box(
            f"{name}.Rung.{index:02d}",
            (0.48, 0.035, 0.035),
            (x, y, z),
            0.002,
            material,
        ))
    return join_parts(parts, name)


def add_grating(
    name,
    center,
    width,
    depth,
    material,
    z=0.0,
    spacing=0.16,
):
    x, y = center
    parts = [
        add_box(f"{name}.Frame.N", (width, 0.08, 0.08), (x, y + depth / 2, z), 0.004, material),
        add_box(f"{name}.Frame.S", (width, 0.08, 0.08), (x, y - depth / 2, z), 0.004, material),
        add_box(f"{name}.Frame.W", (0.08, depth, 0.08), (x - width / 2, y, z), 0.004, material),
        add_box(f"{name}.Frame.E", (0.08, depth, 0.08), (x + width / 2, y, z), 0.004, material),
    ]
    count = max(3, int(depth / spacing))
    for index in range(count):
        py = y - depth / 2 + (index + 0.5) * depth / count
        parts.append(add_box(
            f"{name}.Slat.{index:03d}",
            (width - 0.08, 0.025, 0.055),
            (x, py, z + 0.045),
            0.001,
            material,
        ))
    return join_parts(parts, name)


def add_stairs(
    name,
    start,
    width,
    run,
    rise,
    steps,
    material,
    direction=1.0,
    z_base=0.0,
    landing=0.8,
):
    x, y = start
    steps = max(3, steps)
    tread = run / steps
    step_rise = rise / steps
    landing = max(0.0, landing)
    total_run = run + landing

    profile = [(0.0, 0.0), (total_run, 0.0), (total_run, rise)]
    for index in range(steps - 1, -1, -1):
        profile.append((index * tread, (index + 1) * step_rise))
        if index > 0:
            profile.append((index * tread, index * step_rise))
    profile.append((0.0, 0.0))

    half_width = width / 2
    vertices = []
    for side in (-half_width, half_width):
        for distance, height in profile:
            vertices.append((
                x + direction * distance,
                y + side,
                z_base + height,
            ))
    count = len(profile)
    faces = [
        tuple(range(count)),
        tuple(range(count, count * 2)),
    ]
    for index in range(count):
        following = (index + 1) % count
        faces.append((
            index,
            following,
            count + following,
            count + index,
        ))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.validate()
    mesh.update()
    body = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(body)
    assign_material(body, material)
    apply_bevel(body, min(0.015, tread * 0.04, step_rise * 0.04), 2)

    parts = [body]
    rise_length = math.hypot(run, rise)
    rotation = Vector((1.0, 0.0, 0.0)).rotation_difference(
        Vector((direction * run, 0.0, rise)),
    ).to_euler()
    for side_name, side in (
        ("L", -half_width + 0.04),
        ("R", half_width - 0.04),
    ):
        for rail_index, rail_height in enumerate((0.55, 1.05)):
            parts.append(add_box(
                f"{name}.Rail.{side_name}.{rail_index}",
                (rise_length, 0.055, 0.055),
                (
                    x + direction * run / 2,
                    y + side,
                    z_base + rise / 2 + rail_height,
                ),
                0.0,
                material,
                rotation=rotation,
            ))
        for index in range(5):
            distance = run * index / 4
            stair_height = rise * index / 4
            parts.append(add_box(
                f"{name}.Rail.{side_name}.Post.{index}",
                (0.055, 0.055, 1.08),
                (
                    x + direction * distance,
                    y + side,
                    z_base + stair_height + 0.49,
                ),
                0.0,
                material,
            ))
    return join_parts(parts, name)


def add_truss(
    name,
    start,
    end,
    z,
    width,
    height,
    material=None,
):
    sx, sy = start
    ex, ey = end
    dx = ex - sx
    dy = ey - sy
    length = max((dx * dx + dy * dy) ** 0.5, 0.001)
    angle = -__import__("math").atan2(dy, dx)
    parts = [
        add_box(
            f"{name}.Chord.T",
            (length, width * 0.14, height * 0.12),
            ((sx + ex) / 2, (sy + ey) / 2, z + height / 2),
            0.008,
            material,
            rotation=(0.0, 0.0, angle),
        ),
        add_box(
            f"{name}.Chord.B",
            (length, width * 0.14, height * 0.12),
            ((sx + ex) / 2, (sy + ey) / 2, z - height / 2),
            0.008,
            material,
            rotation=(0.0, 0.0, angle),
        ),
    ]
    count = max(3, int(length / 1.8) + 1)
    for index in range(count):
        t = index / (count - 1)
        parts.append(add_box(
            f"{name}.Web.{index:02d}",
            (0.08, width * 0.12, height),
            (sx + dx * t, sy + dy * t, z),
            0.005,
            material,
            rotation=(0.0, 0.0, angle),
        ))
    return join_parts(parts, name)
