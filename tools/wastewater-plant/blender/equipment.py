import math

import bpy
from mathutils import Vector

from geometry import (
    add_box,
    add_curve_pipe,
    add_cylinder,
    add_grating,
    add_ladder,
    add_railing,
    add_stairs,
    add_truss,
    create_material,
    join_parts,
)


EQUIPMENT_COLORS = {
    "concrete": (0.52, 0.53, 0.48),
    "concreteDark": (0.17, 0.20, 0.22),
    "water": (0.02, 0.27, 0.55),
    "sludge": (0.68, 0.20, 0.04),
    "steel": (0.20, 0.29, 0.34),
    "steelDark": (0.02, 0.045, 0.060),
    "equipment": (0.08, 0.27, 0.45),
    "equipmentLight": (0.30, 0.55, 0.64),
    "safety": (0.95, 0.24, 0.01),
    "rubber": (0.02, 0.025, 0.03),
    "air": (0.62, 0.78, 0.86),
    "glass": (0.02, 0.22, 0.34),
    "stage:intake": (0.035, 0.25, 0.38),
    "stage:primary": (0.07, 0.23, 0.48),
    "stage:biological": (0.035, 0.34, 0.23),
    "stage:secondary": (0.02, 0.30, 0.39),
    "stage:advanced": (0.24, 0.18, 0.48),
    "stage:sludge": (0.52, 0.22, 0.055),
    "stage:chemical": (0.44, 0.12, 0.33),
    "stage:utilities": (0.24, 0.31, 0.35),
}


def create_equipment_materials():
    return {
        key: create_material(f"Equipment.{key}", color, 0.88)
        for key, color in EQUIPMENT_COLORS.items()
    }


def _origin(item):
    x, y, z = item["position"]
    return (x, -z, y)


def _axis_rotation(direction):
    vector = Vector(direction)
    if vector.length < 0.0001:
        return (0.0, 0.0, 0.0)
    return Vector((0.0, 0.0, 1.0)).rotation_difference(vector.normalized()).to_euler()


def _port_fixtures(item, materials):
    parts = []
    ox, oy, oz = _origin(item)
    for index, port in enumerate(item.get("ports", [])):
        px, py, pz = port["position"]
        dx, dy, dz = port["direction"]
        direction = Vector((dx, -dz, dy)).normalized()
        diameter = port["diameter"]
        location = Vector((px, -pz, py))
        rotation = _axis_rotation(direction)
        parts.append(add_cylinder(
            f"Port.{index}.Stub",
            diameter * 0.56,
            0.48,
            tuple(location + direction * 0.2),
            20,
            0.006,
            materials["steel"],
            rotation,
        ))
        parts.append(add_cylinder(
            f"Port.{index}.Flange",
            diameter * 0.91,
            0.10,
            tuple(location + direction * 0.42),
            24,
            0.004,
            materials["steelDark"],
            rotation,
        ))
        for bolt in range(8):
            angle = bolt * math.tau / 8
            radial = Vector((
                math.cos(angle) * diameter * 0.73,
                math.sin(angle) * diameter * 0.73,
                0,
            ))
            if abs(direction.z) > 0.8:
                radial = Vector((
                    math.cos(angle) * diameter * 0.73,
                    0,
                    math.sin(angle) * diameter * 0.73,
                ))
            parts.append(add_cylinder(
                f"Port.{index}.Bolt.{bolt}",
                0.018,
                0.05,
                tuple(location + direction * 0.48 + radial),
                8,
                0.001,
                materials["steelDark"],
                rotation,
            ))
    return parts


def _part(name, size, local_position, origin, material, bevel=0.025, rotation=(0.0, 0.0, 0.0)):
    ox, oy, oz = origin
    lx, ly, lz = local_position
    return add_box(
        name,
        size,
        (ox + lx, oy + ly, oz + lz),
        bevel,
        material,
        rotation,
    )


def _cylinder(
    name,
    radius,
    depth,
    local_position,
    origin,
    material,
    vertices=24,
    bevel=0.018,
    rotation=(0.0, 0.0, 0.0),
):
    ox, oy, oz = origin
    lx, ly, lz = local_position
    return add_cylinder(
        name,
        radius,
        depth,
        (ox + lx, oy + ly, oz + lz),
        vertices,
        bevel,
        material,
        rotation,
    )


def _pipe(name, points, origin, material, radius=0.08):
    ox, oy, oz = origin
    world_points = [(ox + x, oy + y, oz + z) for x, y, z in points]
    return add_curve_pipe(name, world_points, radius, material)


def _tank_shell(
    prefix,
    radius,
    height,
    origin,
    material,
    segments=40,
    wall=0.26,
    z_base=0.18,
):
    parts = []
    circumference = 2 * math.pi * radius
    segment_length = circumference / segments * 1.08
    for index in range(segments):
        angle = index * 2 * math.pi / segments
        x = radius * math.cos(angle)
        y = radius * math.sin(angle)
        parts.append(_part(
            f"{prefix}.Shell.{index:02d}",
            (segment_length, wall, height),
            (x, y, z_base + height / 2),
            origin,
            material,
            0.018,
            rotation=(0.0, 0.0, angle + math.pi / 2),
        ))
    return parts


def _ring_band(
    prefix,
    radius,
    height,
    local_z,
    origin,
    material,
    segments=40,
    thickness=0.16,
):
    parts = []
    segment_length = 2 * math.pi * radius / segments * 1.07
    for index in range(segments):
        angle = index * 2 * math.pi / segments
        parts.append(_part(
            f"{prefix}.{index:02d}",
            (segment_length, thickness, height),
            (
                radius * math.cos(angle),
                radius * math.sin(angle),
                local_z,
            ),
            origin,
            material,
            0.012,
            rotation=(0.0, 0.0, angle + math.pi / 2),
        ))
    return parts


def _radial_arm(prefix, length, width, height, local_z, angle, origin, material):
    return _part(
        prefix,
        (length, width, height),
        (length / 2, 0.0, local_z),
        origin,
        material,
        0.018,
        rotation=(0.0, 0.0, angle),
    )


def build_inlet(item, materials):
    origin = _origin(item)
    parts = [
        _part("Inlet.Base", (8.0, 5.8, 0.5), (0, 0, 0.25), origin, materials["concrete"]),
        _part("Inlet.Wall.N", (8.0, 0.42, 2.1), (0, 2.7, 1.25), origin, materials["concrete"]),
        _part("Inlet.Wall.S", (8.0, 0.42, 2.1), (0, -2.7, 1.25), origin, materials["concrete"]),
        _part("Inlet.Wing.N", (2.4, 0.38, 1.8), (-4.5, 3.7, 1.1), origin, materials["concrete"], rotation=(0.0, 0.0, -0.55)),
        _part("Inlet.Wing.S", (2.4, 0.38, 1.8), (-4.5, -3.7, 1.1), origin, materials["concrete"], rotation=(0.0, 0.0, 0.55)),
        _part("Inlet.Water", (7.1, 4.9, 0.10), (-0.2, 0, 0.98), origin, materials["water"], 0.01),
        _part("Inlet.GateFrame.N", (0.28, 0.28, 2.5), (-2.7, 1.8, 1.4), origin, materials["steel"]),
        _part("Inlet.GateFrame.S", (0.28, 0.28, 2.5), (-2.7, -1.8, 1.4), origin, materials["steel"]),
        _part("Inlet.Gate", (0.15, 3.7, 1.8), (-2.7, 0, 1.32), origin, materials["equipment"]),
        _cylinder("Inlet.GateStem", 0.09, 2.0, (-2.7, 0, 3.1), origin, materials["steel"], 16),
        _cylinder("Inlet.GateWheel", 0.48, 0.12, (-2.7, 0, 4.1), origin, materials["safety"], 24),
    ]
    for index in range(10):
        y = -2.05 + index * 0.455
        parts.append(_part(
            f"Inlet.TrashBar.{index:02d}",
            (0.08, 0.07, 1.55),
            (-3.85, y, 1.55),
            origin,
            materials["steelDark"],
            0.004,
            rotation=(0.0, -0.28, 0.0),
        ))
    parts.extend(_ring_band(
        "Inlet.Handrail",
        4.05,
        0.07,
        2.62,
        origin,
        materials["safety"],
        segments=18,
        thickness=0.06,
    ))
    for side in (-1, 1):
        parts.append(_part(
            f"Inlet.Coping.{side}",
            (7.8, 0.60, 0.18),
            (0, side * 2.68, 2.35),
            origin,
            materials["concreteDark"],
        ))
    return parts


def build_bar_screen(item, materials):
    origin = _origin(item)
    parts = [
        _part("Screen.Base", (8.4, 4.6, 0.55), (0, 0, 0.27), origin, materials["concrete"]),
        _part("Screen.Wall.N", (8.4, 0.38, 2.35), (0, 2.15, 1.42), origin, materials["concrete"]),
        _part("Screen.Wall.S", (8.4, 0.38, 2.35), (0, -2.15, 1.42), origin, materials["concrete"]),
        _part("Screen.Water", (7.3, 3.6, 0.08), (0, 0, 0.92), origin, materials["water"], 0.006),
        _part("Screen.Rack.Top", (0.29, 3.7, 0.25), (0.75, 0, 2.55), origin, materials["steel"]),
        _part("Screen.Rack.Bottom", (0.29, 3.7, 0.25), (-1.35, 0, 0.83), origin, materials["steel"]),
        _part("Screen.Motor", (0.75, 0.55, 0.75), (0.35, 0, 3.05), origin, materials["equipment"]),
        _part("Screen.Gearbox", (0.55, 0.42, 0.52), (1.0, 0, 2.10), origin, materials["steelDark"]),
        _part("Screen.RakeShaft", (1.8, 0.12, 0.12), (-0.2, 0, 1.45), origin, materials["steel"], rotation=(0.0, 0.72, 0.0)),
        _part("Screen.ScreeningsChute", (1.15, 0.82, 0.18), (2.25, 0, 1.45), origin, materials["steelDark"], rotation=(0.0, -0.28, 0.0)),
        _part("Screen.Bin", (1.25, 1.25, 1.15), (3.45, 0, 0.85), origin, materials["equipmentLight"]),
        _part("Screen.BinLip", (1.4, 1.4, 0.10), (3.45, 0, 1.48), origin, materials["safety"]),
    ]
    for index in range(25):
        y = -1.72 + index * (3.44 / 24)
        parts.append(_part(
            f"Screen.Bar.{index:02d}",
            (0.075, 0.065, 2.42),
            (-0.3, y, 1.65),
            origin,
            materials["steelDark"],
            0.003,
            rotation=(0.0, -0.58, 0.0),
        ))
    for index in range(7):
        parts.append(_part(
            f"Screen.RakeTooth.{index:02d}",
            (0.08, 0.06, 0.42),
            (-0.65, -1.55 + index * 0.52, 1.45),
            origin,
            materials["safety"],
            0.002,
            rotation=(0.0, -0.58, 0.0),
        ))
    parts.extend(_rail_segments(
        "Screen.Rail",
        (-4.0, 2.32),
        (4.0, 2.32),
        0.25,
        origin,
        materials["safety"],
    ))
    return parts


def _rail_segments(name, start, end, z, origin, material):
    ox, oy, oz = origin
    return [add_railing(
        name,
        (ox + start[0], oy + start[1]),
        (ox + end[0], oy + end[1]),
        1.05,
        material,
        oz + z,
    )]


def build_pump(item, materials):
    origin = _origin(item)
    parts = [
        _part("Pump.Foundation", (4.8, 2.8, 0.42), (0, 0, 0.21), origin, materials["concrete"]),
        _part("Pump.Rail.L", (4.1, 0.28, 0.20), (0, 0.78, 0.52), origin, materials["steelDark"]),
        _part("Pump.Rail.R", (4.1, 0.28, 0.20), (0, -0.78, 0.52), origin, materials["steelDark"]),
        _part("Pump.Skid", (3.2, 1.45, 0.26), (0, 0, 0.68), origin, materials["equipment"]),
        _cylinder("Pump.Volute", 0.78, 0.72, (-0.65, 0, 1.30), origin, materials["equipment"], 32, rotation=(0.0, math.pi / 2, 0.0)),
        _cylinder("Pump.VoluteHub", 0.34, 0.86, (-0.65, 0, 1.30), origin, materials["equipmentLight"], 24, rotation=(0.0, math.pi / 2, 0.0)),
        _cylinder("Pump.Motor", 0.56, 1.42, (0.85, 0, 1.30), origin, materials["equipmentLight"], 28, rotation=(0.0, math.pi / 2, 0.0)),
        _cylinder("Pump.MotorFin", 0.69, 1.05, (0.85, 0, 1.30), origin, materials["steel"], 18, rotation=(0.0, math.pi / 2, 0.0)),
        _cylinder("Pump.Coupling", 0.31, 0.48, (0.03, 0, 1.30), origin, materials["steel"], 20, rotation=(0.0, math.pi / 2, 0.0)),
        _part("Pump.CouplingGuard", (0.62, 0.72, 0.55), (0.03, 0, 1.38), origin, materials["safety"], 0.06),
        _pipe("Pump.Suction", ((-1.5, 0, 1.30), (-1.5, 0, 0.45), (-2.35, 0, 0.45)), origin, materials["water"], 0.21),
        _pipe("Pump.Discharge", ((-0.65, 0, 1.91), (-0.65, 0, 2.70), (0.7, 0, 2.70), (0.7, 0, 2.15)), origin, materials["water"], 0.17),
        _cylinder("Pump.DischargeValve", 0.27, 0.30, (0.7, 0, 2.30), origin, materials["safety"], 20),
        _cylinder("Pump.ValveStem", 0.06, 0.72, (0.7, 0, 2.73), origin, materials["steel"], 12),
        _cylinder("Pump.Handwheel", 0.36, 0.09, (0.7, 0, 3.10), origin, materials["safety"], 20),
        _cylinder("Pump.Gauge", 0.17, 0.12, (0.35, -0.12, 2.72), origin, materials["steelDark"], 18),
    ]
    for index in range(5):
        parts.append(_part(
            f"Pump.MotorRib.{index:02d}",
            (0.06, 1.42, 0.07),
            (-0.01 + index * 0.30, 0, 1.87),
            origin,
            materials["steelDark"],
            0.003,
        ))
    return parts


def build_grit_basin(item, materials):
    origin = _origin(item)
    parts = [
        _part("Grit.Base", (10.5, 7.6, 0.55), (0, 0, 0.28), origin, materials["concrete"]),
        _part("Grit.Wall.N", (10.5, 0.46, 4.2), (0, 3.55, 2.38), origin, materials["concrete"]),
        _part("Grit.Wall.S", (10.5, 0.46, 4.2), (0, -3.55, 2.38), origin, materials["concrete"]),
        _part("Grit.Wall.W", (0.46, 7.6, 4.2), (-5.05, 0, 2.38), origin, materials["concrete"]),
        _part("Grit.Wall.E", (0.46, 7.6, 4.2), (5.05, 0, 2.38), origin, materials["concrete"]),
        _part("Grit.Water", (9.4, 6.6, 0.10), (0, 0, 3.55), origin, materials["water"], 0.01),
        _part("Grit.Bridge.Deck", (0.95, 7.2, 0.20), (0.8, 0, 4.55), origin, materials["steel"]),
        _part("Grit.Bridge.Beam.N", (0.22, 7.15, 0.32), (0.8, 0, 4.30), origin, materials["steelDark"]),
        _part("Grit.Scraper", (8.8, 0.25, 0.28), (0.6, 0, 0.82), origin, materials["steelDark"]),
        _part("Grit.SandHopper", (2.3, 2.1, 0.7), (-3.5, -2.1, 0.70), origin, materials["concreteDark"], 0.15),
        _pipe("Grit.AirHeader", ((-4.3, -2.8, 3.35), (4.3, -2.8, 3.35)), origin, materials["air"], 0.10),
    ]
    for index in range(6):
        x = -3.8 + index * 1.52
        parts.append(_pipe(
            f"Grit.AirBranch.{index:02d}",
            ((x, -2.8, 3.30), (x, -2.8, 2.05), (x, -0.4, 2.05)),
            origin,
            materials["air"],
            0.045,
        ))
        for bubble_index in range(3):
            parts.append(_cylinder(
                f"Grit.AirDrop.{index:02d}.{bubble_index:02d}",
                0.06,
                1.4,
                (x, -0.4 + bubble_index * 0.55, 1.42),
                origin,
                materials["air"],
                10,
            ))
    for side in (-1, 1):
        parts.append(add_ladder(
            f"Grit.Ladder.{side}",
            origin[0] + 5.35,
            origin[1] + side * 2.6,
            3.0,
            materials["safety"],
            origin[2],
        ))
    parts.extend(_ring_band(
        "Grit.Rail",
        4.8,
        0.06,
        3.85,
        origin,
        materials["safety"],
        segments=28,
        thickness=0.06,
    ))
    return parts


def build_grit_classifier(item, materials):
    origin = _origin(item)
    parts = [
        _part("Classifier.Skid", (5.5, 2.8, 0.35), (0, 0, 0.18), origin, materials["steelDark"]),
        _cylinder("Classifier.ScrewCasing", 0.72, 4.6, (0, 0, 1.0), origin, materials["equipment"], 28, rotation=(0, math.pi / 2, 0)),
        _cylinder("Classifier.Motor", 0.44, 1.0, (2.35, 0, 1.62), origin, materials["equipmentLight"], 24, rotation=(0, math.pi / 2, 0)),
        _part("Classifier.DischargeBox", (1.3, 1.3, 1.3), (-2.45, 0, 1.18), origin, materials["equipment"]),
        _pipe("Classifier.SandInlet", ((-1.8, 0, 2.25), (-1.8, 0, 3.1), (-3.5, 0, 3.1)), origin, materials["sludge"], 0.16),
        _pipe("Classifier.WaterOutlet", ((1.6, 0, 1.15), (1.6, 0, 0.5), (3.0, 0, 0.5)), origin, materials["water"], 0.13),
    ]
    for index in range(9):
        parts.append(_cylinder(
            f"Classifier.ScrewFlight.{index:02d}",
            0.82,
            0.12,
            (-1.7 + index * 0.42, 0, 1.0),
            origin,
            materials["steel"],
            20,
            rotation=(0.0, math.pi / 2, index * 0.4),
        ))
    return parts


def build_rectangular_clarifier(item, materials):
    origin = _origin(item)
    wall_height = 4.8
    deck_z = 5.02
    parts = [
        _part("Primary.Base", (13.0, 10.8, 0.55), (0, 0, 0.28), origin, materials["concrete"]),
        _part("Primary.Wall.N", (13.0, 0.48, wall_height), (0, 5.15, 2.7), origin, materials["concrete"]),
        _part("Primary.Wall.S", (13.0, 0.48, wall_height), (0, -5.15, 2.7), origin, materials["concrete"]),
        _part("Primary.Wall.W", (0.48, 10.8, wall_height), (-6.25, 0, 2.7), origin, materials["concrete"]),
        _part("Primary.Wall.E", (0.48, 10.8, wall_height), (6.25, 0, 2.7), origin, materials["concrete"]),
        _part("Primary.Water", (11.8, 9.7, 0.10), (0, 0, 4.28), origin, materials["water"], 0.01),
        _part("Primary.Bridge.Deck", (1.05, 11.2, 0.20), (-0.8, 0, deck_z), origin, materials["steel"]),
        _part("Primary.Bridge.Beam.N", (0.22, 11.0, 0.34), (-0.8, 0, deck_z - 0.30), origin, materials["steelDark"]),
        _part("Primary.ScraperBeam", (12.2, 0.42, 0.45), (0, 0, 0.65), origin, materials["steelDark"]),
        _part("Primary.SludgeHopper", (3.2, 3.0, 1.0), (3.8, 0, 0.5), origin, materials["concreteDark"], 0.15),
        _part("Primary.Weir.N", (12.4, 0.18, 0.34), (0, 4.45, 4.18), origin, materials["steelDark"]),
        _part("Primary.Weir.S", (12.4, 0.18, 0.34), (0, -4.45, 4.18), origin, materials["steelDark"]),
        _pipe("Primary.Outlet", ((4.8, -4.5, 4.14), (4.8, -6.1, 4.14), (4.8, -6.1, 0.5)), origin, materials["water"], 0.17),
    ]
    for index in range(14):
        y = -4.1 + index * 0.63
        parts.append(_part(
            f"Primary.ScraperBlade.{index:02d}",
            (0.42, 0.55, 0.18),
            (-5.4 + index * 0.78, -4.1 + index * 0.63, 0.62),
            origin,
            materials["steelDark"],
        ))
    for side in (-1, 1):
        parts.append(_part(
            f"Primary.WalkwayRail.{side}",
            (13.0, 0.09, 0.09),
            (0, side * 5.55, deck_z + 1.03),
            origin,
            materials["safety"],
        ))
        for index in range(7):
            parts.append(_part(
                f"Primary.RailPost.{side}.{index:02d}",
                (0.08, 0.08, 1.05),
                (-5.8 + index * 1.93, side * 5.55, deck_z + 0.50),
                origin,
                materials["safety"],
            ))
    parts.append(add_grating(
        "Primary.BridgeGrating",
        (origin[0] - 0.8, origin[1]),
        0.92,
        10.8,
        materials["steel"],
        origin[2] + deck_z + 0.12,
    ))
    for index in range(5):
        x = -5.7 + index * 2.85
        parts.append(_part(
            f"Primary.CopingPost.{index:02d}",
            (0.32, 0.32, 0.72),
            (x, -5.38, wall_height - 0.25),
            origin,
            materials["concreteDark"],
        ))
    return parts


def build_distribution_well(item, materials):
    origin = _origin(item)
    parts = [
        _part("Well.Foundation", (5.4, 5.4, 0.45), (0, 0, 0.22), origin, materials["concrete"]),
    ]
    parts.extend(_tank_shell(
        "Well",
        2.35,
        2.8,
        origin,
        materials["concrete"],
        segments=32,
        wall=0.32,
        z_base=0.38,
    ))
    parts.extend(_ring_band(
        "Well.Coping",
        2.42,
        0.16,
        3.28,
        origin,
        materials["concreteDark"],
        segments=32,
        thickness=0.42,
    ))
    parts.extend([
        _cylinder("Well.Water", 2.0, 0.09, (0, 0, 1.25), origin, materials["water"], 32, 0.005),
        _cylinder("Well.InletColumn", 0.50, 2.2, (0, 0, 1.55), origin, materials["concreteDark"], 24),
        _pipe("Well.Inlet", ((-2.8, 0, 2.4), (-1.1, 0, 2.4), (-0.5, 0, 1.85)), origin, materials["water"], 0.19),
        _pipe("Well.OutletA", ((1.0, 0, 1.4), (2.7, 0, 1.4), (3.2, 0, 0.55)), origin, materials["water"], 0.16),
        _pipe("Well.OutletB", ((0, 1.0, 1.4), (0, 2.7, 1.4), (0, 3.2, 0.55)), origin, materials["water"], 0.16),
        _cylinder("Well.GateWheel", 0.38, 0.08, (2.1, 0, 3.2), origin, materials["safety"], 24),
        _cylinder("Well.GateStem", 0.055, 1.2, (2.1, 0, 2.65), origin, materials["steel"], 12),
    ])
    return parts


def build_biological_reactor(item, materials):
    origin = _origin(item)
    wall_height = 5.4
    deck_z = 5.48
    parts = [
        _part("Reactor.Base", (12.2, 15.0, 0.48), (0, 0, 0.24), origin, materials["concrete"]),
        _part("Reactor.Wall.N", (12.2, 0.45, wall_height), (0, 7.25, 3.0), origin, materials["concrete"]),
        _part("Reactor.Wall.S", (12.2, 0.45, wall_height), (0, -7.25, 3.0), origin, materials["concrete"]),
        _part("Reactor.Wall.W", (0.45, 15.0, wall_height), (-6.1, 0, 3.0), origin, materials["concrete"]),
        _part("Reactor.Wall.E", (0.45, 15.0, wall_height), (6.1, 0, 3.0), origin, materials["concrete"]),
        _part("Reactor.Walkway", (11.7, 1.85, 0.18), (0, 0, deck_z), origin, materials["steel"]),
        _part("Reactor.AirHeader", (11.2, 0.16, 0.16), (0, -6.6, 5.18), origin, materials["air"]),
    ]
    for compartment, center_x in enumerate((-4.0, 0.0, 4.0)):
        if compartment < 2:
            parts.append(_part(
                f"Reactor.Compartment.{compartment}.Water",
                (3.45, 13.7, 0.08),
                (center_x, 0, 4.92),
                origin,
                materials["water"],
                0.006,
            ))
        if compartment > 0:
            parts.append(_part(
                f"Reactor.Divider.{compartment}",
                (0.32, 14.4, 4.82),
                (center_x - 2.0, 0, 2.78),
                origin,
                materials["concreteDark"],
            ))
        if compartment < 2:
            parts.extend([
                _cylinder(
                    f"Reactor.Mixer.{compartment}.Pedestal",
                    0.48,
                    0.32,
                    (center_x, 0, 5.62),
                    origin,
                    materials["steelDark"],
                    24,
                ),
                _cylinder(
                    f"Reactor.Mixer.{compartment}.Drive",
                    0.30,
                    0.62,
                    (center_x, 0, 6.02),
                    origin,
                    materials["equipment"],
                    24,
                ),
                _cylinder(
                    f"Reactor.Mixer.{compartment}.Shaft",
                    0.06,
                    4.2,
                    (center_x, 0, 3.65),
                    origin,
                    materials["steel"],
                    12,
                ),
                _part(
                    f"Reactor.Mixer.{compartment}.Propeller",
                    (1.55, 0.18, 0.20),
                    (center_x, 0, 1.72),
                    origin,
                    materials["steelDark"],
                    rotation=(0.0, 0.0, compartment * 0.8),
                ),
            ])
        for row in range(3):
            for column in range(3):
                parts.append(_cylinder(
                    f"Reactor.Diffuser.{compartment}.{row}.{column}",
                    0.30,
                    0.14,
                    (center_x - 1.1 + column * 1.1, -4.6 + row * 4.6, 1.32),
                    origin,
                    materials["air"],
                    18,
                ))
                parts.append(_pipe(
                    f"Reactor.DiffuserDrop.{compartment}.{row}.{column}",
                    (
                        (center_x - 1.1 + column * 1.1, -4.6 + row * 4.6, 1.34),
                        (center_x - 1.1 + column * 1.1, -6.25, 2.20),
                        (center_x - 1.1 + column * 1.1, -6.25, 5.10),
                    ),
                    origin,
                    materials["air"],
                    0.035,
                ))
    for side in (-1, 1):
        parts.append(add_railing(
            f"Reactor.WalkwayRail.{side}",
            (origin[0] - 5.7, origin[1] + side * 0.92),
            (origin[0] + 5.7, origin[1] + side * 0.92),
            1.08,
            materials["safety"],
            origin[2] + deck_z,
        ))
        parts.extend(_rail_segments(
            f"Reactor.PerimeterRail.{side}",
            (-5.7, side * 7.0),
            (5.7, side * 7.0),
            deck_z - 0.04,
            origin,
            materials["safety"],
        ))
    parts.append(add_grating(
        "Reactor.WalkwayGrating",
        (origin[0], origin[1]),
        11.5,
        1.45,
        materials["steel"],
        origin[2] + deck_z + 0.10,
    ))
    parts.append(add_stairs(
        "Reactor.AccessStairs",
        (origin[0] + 6.2, origin[1]),
        1.5,
        6.8,
        5.35,
        22,
        materials["safety"],
        direction=1.0,
        z_base=origin[2],
    ))
    for index in range(4):
        parts.append(_cylinder(
            f"Reactor.AirValve.{index:02d}",
            0.15,
            0.36,
            (-4.5 + index * 3.0, 6.6, 5.08),
            origin,
            materials["safety"],
            18,
        ))
    parts.extend(_rail_segments(
        "Reactor.PerimeterRail.N",
        (-5.7, 6.95),
        (5.7, 6.95),
        deck_z - 0.02,
        origin,
        materials["safety"],
    ))
    parts.extend(_rail_segments(
        "Reactor.PerimeterRail.S",
        (-5.7, -6.95),
        (5.7, -6.95),
        deck_z - 0.02,
        origin,
        materials["safety"],
    ))
    return parts


def build_circular_clarifier(item, materials):
    origin = _origin(item)
    radius = 7.25
    wall_height = 4.15
    deck_z = 4.92
    parts = [
        _part("Clarifier.Foundation", (15.8, 15.8, 0.38), (0, 0, 0.19), origin, materials["concrete"]),
        _cylinder("Clarifier.Water", radius - 0.32, 0.10, (0, 0, 4.02), origin, materials["water"], 40, 0.005),
    ]
    parts.extend(_tank_shell(
        "Clarifier",
        radius,
        wall_height,
        origin,
        materials["concrete"],
        segments=26,
        wall=0.30,
        z_base=0.30,
    ))
    parts.extend(_ring_band(
        "Clarifier.Coping",
        7.26,
        0.20,
        4.47,
        origin,
        materials["concreteDark"],
        segments=26,
        thickness=0.52,
    ))
    parts.extend(_ring_band(
        "Clarifier.Launder",
        6.10,
        0.48,
        3.66,
        origin,
        materials["concreteDark"],
        segments=24,
        thickness=0.22,
    ))
    parts.extend(_ring_band(
        "Clarifier.Weir",
        5.80,
        0.34,
        3.96,
        origin,
        materials["steel"],
        segments=24,
        thickness=0.08,
    ))
    parts.extend(_ring_band(
        "Clarifier.ScumBaffle",
        5.32,
        0.76,
        3.78,
        origin,
        materials["steelDark"],
        segments=22,
        thickness=0.07,
    ))
    parts.extend([
        _cylinder("Clarifier.FeedWell", 1.72, 3.70, (0, 0, 2.14), origin, materials["concreteDark"], 40),
        _cylinder("Clarifier.FeedWellCap", 1.95, 0.24, (0, 0, 4.10), origin, materials["concrete"], 40),
        _cylinder("Clarifier.CenterDrive", 1.10, 1.32, (0, 0, 4.42), origin, materials["equipment"], 32),
        _cylinder("Clarifier.DriveMotor", 0.50, 0.92, (0.3, 0, 5.22), origin, materials["equipmentLight"], 24),
        _part("Clarifier.Bridge.Deck", (13.2, 1.55, 0.18), (0, 0, deck_z), origin, materials["steel"]),
        _part("Clarifier.Bridge.Guardrail.N", (13.3, 0.09, 0.09), (0, 0.73, deck_z + 1.05), origin, materials["safety"]),
        _part("Clarifier.Bridge.Guardrail.S", (13.3, 0.09, 0.09), (0, -0.73, deck_z + 1.05), origin, materials["safety"]),
        _part("Clarifier.ScraperArm.A", (11.4, 0.32, 0.34), (2.0, 0, 0.67), origin, materials["steelDark"], rotation=(0, 0, 0.43)),
        _part("Clarifier.ScraperArm.B", (11.4, 0.32, 0.34), (-2.0, 0, 0.67), origin, materials["steelDark"], rotation=(0, 0, 0.43)),
        _part("Clarifier.OutletPipe", (1.3, 0.42, 0.42), (6.65, -1.2, 3.96), origin, materials["water"]),
    ])
    parts.extend(_ring_band(
        "Clarifier.BridgePost",
        5.4,
        1.0,
        deck_z + 0.45,
        origin,
        materials["safety"],
        segments=13,
        thickness=0.055,
    ))
    bridge_truss = add_truss(
        "Clarifier.HalfBridgeTruss",
        (origin[0], origin[1]),
        (origin[0] + 6.7, origin[1]),
        origin[2] + deck_z - 0.42,
        1.05,
        0.80,
        materials["steel"],
    )
    parts.append(bridge_truss)
    for index in range(10):
        angle = -0.45 + index * 0.10
        parts.append(_radial_arm(
            f"Clarifier.ScraperBlade.{index:02d}",
            5.2,
            0.18,
            0.24,
            0.56,
            angle,
            origin,
            materials["steelDark"],
        ))
    parts.append(add_ladder(
        "Clarifier.Ladder",
        origin[0] + 7.55,
        origin[1],
        4.62,
        materials["safety"],
        origin[2],
    ))
    parts.append(add_grating(
        "Clarifier.BridgeGrating",
        (origin[0] + 3.0, origin[1]),
        6.2,
        1.15,
        materials["steel"],
        origin[2] + deck_z + 0.12,
    ))
    parts.append(add_stairs(
        "Clarifier.AccessStairs",
        (origin[0] + 8.2, origin[1]),
        1.35,
        6.7,
        4.62,
        19,
        materials["safety"],
        direction=1.0,
        z_base=origin[2],
    ))
    parts.append(_pipe(
        "Clarifier.Outlet",
        ((6.6, -1.2, 3.96), (8.0, -1.2, 3.96), (8.0, -1.2, 0.55)),
        origin,
        materials["water"],
        0.18,
    ))
    return parts


def build_blower(item, materials):
    origin = _origin(item)
    parts = [
        _part("Blower.Foundation", (7.0, 4.2, 0.45), (0, 0, 0.225), origin, materials["concrete"]),
        _part("Blower.Skid.L", (6.4, 0.34, 0.30), (0, 1.40, 0.60), origin, materials["steelDark"]),
        _part("Blower.Skid.R", (6.4, 0.34, 0.30), (0, -1.40, 0.60), origin, materials["steelDark"]),
        _part("Blower.Enclosure", (2.55, 2.45, 2.25), (-0.80, 0, 1.72), origin, materials["equipment"], 0.12),
        _part("Blower.EnclosurePanel.N", (2.50, 0.08, 1.82), (-0.80, 1.23, 1.78), origin, materials["equipmentLight"]),
        _part("Blower.EnclosurePanel.S", (2.50, 0.08, 1.82), (-0.80, -1.23, 1.78), origin, materials["equipmentLight"]),
        _part("Blower.EnclosurePanel.E", (0.08, 2.40, 1.82), (0.50, 0, 1.78), origin, materials["equipmentLight"]),
        _cylinder("Blower.Motor", 0.62, 1.95, (1.72, 0, 1.60), origin, materials["equipmentLight"], 32, rotation=(0.0, math.pi / 2, 0.0)),
        _cylinder("Blower.MotorCap", 0.69, 0.22, (2.80, 0, 1.60), origin, materials["steelDark"], 24, rotation=(0.0, math.pi / 2, 0.0)),
        _cylinder("Blower.FlexibleConnector", 0.44, 0.76, (0.70, 0, 1.60), origin, materials["rubber"], 24, rotation=(0.0, math.pi / 2, 0.0)),
        _cylinder("Blower.IntakeFilter", 0.60, 0.88, (-2.45, 0, 1.82), origin, materials["steel"], 24, rotation=(0.0, math.pi / 2, 0.0)),
        _cylinder("Blower.Silencer", 0.52, 1.25, (-3.35, 0, 1.82), origin, materials["equipment"], 24, rotation=(0.0, math.pi / 2, 0.0)),
        _pipe("Blower.Discharge", ((1.0, 0, 1.60), (1.0, 0, 3.10), (2.65, 0, 3.10), (2.65, 0, 1.62)), origin, materials["air"], 0.21),
        _cylinder("Blower.CheckValve", 0.31, 0.42, (2.65, 0, 2.15), origin, materials["safety"], 22),
        _cylinder("Blower.Gauge", 0.16, 0.12, (1.80, -0.15, 3.18), origin, materials["steelDark"], 18),
    ]
    for index in range(9):
        parts.append(_cylinder(
            f"Blower.ConnectorRib.{index:02d}",
            0.415,
            0.045,
            (0.33 + index * 0.085, 0, 1.33),
            origin,
            materials["steelDark"],
            20,
            rotation=(0.0, math.pi / 2, 0.0),
        ))
    for index in range(5):
        parts.append(_part(
            f"Blower.EnclosureLouver.{index:02d}",
            (1.55, 0.05, 0.055),
            (-0.75, -1.12, 1.02 + index * 0.22),
            origin,
            materials["steelDark"],
            0.002,
        ))
    return parts


def _tank(
    prefix,
    width,
    depth,
    height,
    origin,
    materials,
    water=True,
):
    parts = [
        _part(f"{prefix}.Base", (width + 0.8, depth + 0.8, 0.46), (0, 0, 0.23), origin, materials["concrete"]),
        _part(f"{prefix}.Wall.N", (width, 0.42, height), (0, depth / 2, height / 2 + 0.30), origin, materials["concrete"]),
        _part(f"{prefix}.Wall.S", (width, 0.42, height), (0, -depth / 2, height / 2 + 0.30), origin, materials["concrete"]),
        _part(f"{prefix}.Wall.W", (0.42, depth, height), (-width / 2, 0, height / 2 + 0.30), origin, materials["concrete"]),
        _part(f"{prefix}.Wall.E", (0.42, depth, height), (width / 2, 0, height / 2 + 0.30), origin, materials["concrete"]),
    ]
    if water:
        parts.append(_part(
            f"{prefix}.Water",
            (width - 0.72, depth - 0.72, 0.08),
            (0, 0, height * 0.52),
            origin,
            materials["water"],
            0.006,
        ))
    coping_z = height + 0.36
    parts.extend([
        _part(
            f"{prefix}.Coping.N",
            (width + 0.58, 0.62, 0.16),
            (0, depth / 2 + 0.08, coping_z),
            origin,
            materials["concreteDark"],
            0.012,
        ),
        _part(
            f"{prefix}.Coping.S",
            (width + 0.58, 0.62, 0.16),
            (0, -depth / 2 - 0.08, coping_z),
            origin,
            materials["concreteDark"],
            0.012,
        ),
        _part(
            f"{prefix}.Coping.W",
            (0.62, depth + 0.58, 0.16),
            (-width / 2 - 0.08, 0, coping_z),
            origin,
            materials["concreteDark"],
            0.012,
        ),
        _part(
            f"{prefix}.Coping.E",
            (0.62, depth + 0.58, 0.16),
            (width / 2 + 0.08, 0, coping_z),
            origin,
            materials["concreteDark"],
            0.012,
        ),
    ])
    for x_side in (-1, 1):
        for y_side in (-1, 1):
            parts.append(_part(
                f"{prefix}.CornerPost.{x_side}.{y_side}",
                (0.34, 0.34, height + 0.72),
                (
                    x_side * (width / 2 + 0.02),
                    y_side * (depth / 2 + 0.02),
                    (height + 0.72) / 2 + 0.08,
                ),
                origin,
                materials["concreteDark"],
                0.025,
            ))
    for index in range(max(3, int(width / 2.8))):
        x = -width * 0.42 + width * 0.84 * index / max(
            int(width / 2.8) - 1,
            1,
        )
        for side in (-1, 1):
            parts.append(_part(
                f"{prefix}.WallRib.{side}.{index:02d}",
                (0.14, 0.16, height * 0.78),
                (x, side * (depth / 2 + 0.23), height * 0.42 + 0.25),
                origin,
                materials["concreteDark"],
                0.008,
            ))
    parts.append(add_ladder(
        f"{prefix}.ServiceLadder",
        origin[0] + width / 2 + 0.52,
        origin[1],
        height + 0.45,
        materials["safety"],
        origin[2],
    ))
    return parts


def _dome(prefix, radius, location, origin, material, scale_z=0.48):
    ox, oy, oz = origin
    lx, ly, lz = location
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=28,
        ring_count=12,
        radius=radius,
        location=(ox + lx, oy + ly, oz + lz),
    )
    obj = bpy.context.object
    obj.name = prefix
    obj.scale.z = scale_z
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    return obj


def _cone(
    prefix,
    radius_top,
    radius_bottom,
    depth,
    location,
    origin,
    material,
    vertices=28,
):
    ox, oy, oz = origin
    lx, ly, lz = location
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius_bottom,
        radius2=radius_top,
        depth=depth,
        location=(ox + lx, oy + ly, oz + lz),
    )
    obj = bpy.context.object
    obj.name = prefix
    obj.data.materials.append(material)
    return obj


def build_coagulation_basin(item, materials):
    origin = _origin(item)
    parts = _tank("Coagulation", 12.5, 10.0, 4.2, origin, materials, water=False)
    for index, x in enumerate((-4.0, 0.0, 4.0)):
        parts.append(_part(
            f"Coagulation.Compartment.{index}.Water",
            (3.55, 8.7, 0.08),
            (x, 0, 3.68),
            origin,
            materials["water"],
            0.005,
        ))
        parts.append(_cylinder(
            f"Coagulation.Mixer.{index}.Drive",
            0.35,
            0.72,
            (x, 0, 4.95),
            origin,
            materials["equipment"],
            22,
        ))
        parts.append(_cylinder(
            f"Coagulation.Mixer.{index}.Shaft",
            0.08,
            3.25,
            (x, 0, 3.28),
            origin,
            materials["steel"],
            12,
        ))
        for paddle in range(2):
            parts.append(_part(
                f"Coagulation.Mixer.{index}.Paddle.{paddle}",
                (1.25, 0.14, 0.28),
                (x, 0, 2.05 - paddle * 0.58),
                origin,
                materials["steelDark"],
                rotation=(0.0, 0.0, paddle * math.pi / 2),
            ))
    for index, x in enumerate((-2.0, 2.0)):
        parts.append(_part(
            f"Coagulation.Divider.{index}",
            (0.28, 8.8, 3.86),
            (x, 0, 2.31),
            origin,
            materials["concreteDark"],
        ))
    parts.extend([
        _part("Coagulation.Walkway", (12.2, 1.45, 0.16), (0, 4.55, 4.70), origin, materials["steel"]),
        _part("Coagulation.InletPipe", (0.35, 4.0, 0.35), (-5.1, 0, 3.35), origin, materials["water"]),
        _part("Coagulation.SludgeHopper", (3.8, 2.8, 0.9), (3.6, 0, 0.45), origin, materials["concreteDark"], 0.16),
        _pipe("Coagulation.ChemicalHeader", ((-4.8, 4.0, 4.95), (4.8, 4.0, 4.95)), origin, materials["safety"], 0.07),
    ])
    for index in range(4):
        parts.append(_pipe(
            f"Coagulation.ChemicalDrop.{index}",
            ((-4.2 + index * 2.8, 4.0, 4.92), (-4.2 + index * 2.8, 2.2, 4.92), (-4.2 + index * 2.8, 2.2, 3.72)),
            origin,
            materials["safety"],
            0.035,
        ))
    return parts


def build_filter_cell(item, materials):
    origin = _origin(item)
    parts = _tank("Filter", 12.0, 9.0, 4.0, origin, materials, water=False)
    for index, x in enumerate((-3.8, 0.0, 3.8)):
        parts.append(_part(
            f"Filter.Cell.{index}.Water",
            (3.45, 7.8, 0.08),
            (x, 0, 3.40),
            origin,
            materials["water"],
            0.005,
        ))
        parts.append(_part(
            f"Filter.Cell.{index}.Media",
            (3.10, 7.15, 0.34),
            (x, 0, 3.05),
            origin,
            materials["concreteDark"],
            0.012,
        ))
        parts.append(_part(
            f"Filter.Weir.{index}",
            (0.16, 7.45, 0.40),
            (x + 1.63, 0, 3.56),
            origin,
            materials["steel"],
        ))
        parts.append(_part(
            f"Filter.Trough.{index}",
            (0.52, 8.0, 0.36),
            (x + 1.28, 0, 3.76),
            origin,
            materials["concreteDark"],
        ))
        parts.append(_pipe(
            f"Filter.BackwashHeader.{index}",
            ((x, -4.0, 4.05), (x, -2.7, 4.05), (x, -2.7, 3.18)),
            origin,
            materials["air"],
            0.09,
        ))
    for index, x in enumerate((-1.9, 1.9)):
        parts.append(_part(
            f"Filter.Divider.{index}",
            (0.26, 8.2, 3.78),
            (x, 0, 2.26),
            origin,
            materials["concreteDark"],
        ))
    parts.append(_part(
        "Filter.GratingWalkway",
        (11.5, 1.50, 0.14),
        (0, 0, 4.48),
        origin,
        materials["steel"],
    ))
    for index in range(16):
        parts.append(_part(
            f"Filter.Grating.{index:02d}",
            (0.08, 1.20, 0.06),
            (-5.25 + index * 0.70, 0, 4.58),
            origin,
            materials["steelDark"],
            0.002,
        ))
    for side in (-1, 1):
        parts.extend(_rail_segments(
            f"Filter.WalkwayRail.{side}",
            (-5.5, side * 0.72),
            (5.5, side * 0.72),
            4.44,
            origin,
            materials["safety"],
        ))
    return parts


def build_contact_basin(item, materials):
    origin = _origin(item)
    parts = _tank("Contact", 13.0, 9.5, 3.8, origin, materials, water=False)
    for index in range(5):
        y = -3.4 + index * 1.7
        parts.append(_part(
            f"Contact.Channel.{index}.Water",
            (11.6 if index % 2 == 0 else 9.2, 1.28, 0.08),
            (-0.25 if index % 2 == 0 else 0.85, y, 3.08),
            origin,
            materials["water"],
            0.005,
        ))
        parts.append(_part(
            f"Contact.Baffle.{index}",
            (9.4 if index % 2 == 0 else 10.8, 0.24, 3.38),
            (0.8 if index % 2 == 0 else -0.4, y + 0.72, 2.04),
            origin,
            materials["concreteDark"],
        ))
        parts.append(_part(
            f"Contact.Gate.{index}",
            (1.15, 0.20, 1.45),
            (-4.0 if index % 2 == 0 else 4.0, y, 2.28),
            origin,
            materials["steel"],
        ))
    parts.extend([
        _part("Contact.Walkway", (12.5, 1.40, 0.16), (0, 3.9, 4.28), origin, materials["steel"]),
        _pipe("Contact.DisinfectionHeader", ((-5.5, 3.8, 4.56), (5.5, 3.8, 4.56)), origin, materials["safety"], 0.085),
        _cylinder("Contact.FlowMeter", 0.24, 0.44, (5.3, -0.4, 3.08), origin, materials["equipment"], 22),
        _pipe("Contact.Outlet", ((5.7, -2.8, 3.05), (7.1, -2.8, 3.05), (7.1, -2.8, 0.45)), origin, materials["water"], 0.15),
    ])
    for index in range(5):
        parts.append(_pipe(
            f"Contact.DosingDrop.{index}",
            ((5.0, 3.8, 4.53), (5.0, 3.8 - index * 1.22, 4.05), (4.4, 3.8 - index * 1.22, 4.05)),
            origin,
            materials["safety"],
            0.025,
        ))
    return parts


def build_membrane_basin(item, materials):
    origin = _origin(item)
    parts = _tank("Membrane", 13.0, 9.5, 4.2, origin, materials, water=False)
    parts.append(_part(
        "Membrane.Water",
        (12.0, 8.4, 0.08),
        (0, 0, 3.55),
        origin,
        materials["water"],
        0.005,
    ))
    for cassette in range(4):
        x = -4.1 + cassette * 2.75
        parts.append(_part(
            f"Membrane.Cassette.{cassette}.Frame",
            (2.2, 6.8, 2.55),
            (x, 0, 2.45),
            origin,
            materials["steel"],
            0.025,
        ))
        for membrane in range(5):
            parts.append(_part(
                f"Membrane.Cassette.{cassette}.Sheet.{membrane}",
                (0.06, 6.25, 1.30),
                (x - 0.76 + membrane * 0.38, 0, 2.48),
                origin,
                materials["equipmentLight"],
                0.004,
            ))
    parts.extend([
        _part("Membrane.Walkway", (12.5, 1.45, 0.16), (0, 4.0, 4.68), origin, materials["steel"]),
        _pipe("Membrane.PermeateHeader", ((-5.4, -3.9, 4.45), (5.4, -3.9, 4.45)), origin, materials["water"], 0.13),
        _pipe("Membrane.BackwashHeader", ((-5.2, 4.0, 4.70), (5.2, 4.0, 4.70)), origin, materials["air"], 0.10),
        _cylinder("Membrane.VacuumPump", 0.46, 1.1, (5.5, -3.6, 0.82), origin, materials["equipment"], 24, rotation=(0, math.pi / 2, 0)),
    ])
    for index in range(4):
        parts.append(_pipe(
            f"Membrane.CassetteHeader.{index}",
            ((-4.1 + index * 2.75, -3.9, 2.95), (-4.1 + index * 2.75, -3.9, 2.1), (-4.1 + index * 2.75, -0.6, 2.1)),
            origin,
            materials["water"],
            0.05,
        ))
    return parts


def build_chemical_tank(item, materials):
    origin = _origin(item)
    parts = [
        _part("Chemical.BundBase", (6.4, 6.4, 0.38), (0, 0, 0.19), origin, materials["concrete"]),
        _part("Chemical.Bund.N", (6.4, 0.34, 1.15), (0, 3.03, 0.57), origin, materials["concreteDark"]),
        _part("Chemical.Bund.S", (6.4, 0.34, 1.15), (0, -3.03, 0.57), origin, materials["concreteDark"]),
        _part("Chemical.Bund.W", (0.34, 6.4, 1.15), (-3.03, 0, 0.57), origin, materials["concreteDark"]),
        _part("Chemical.Bund.E", (0.34, 6.4, 1.15), (3.03, 0, 0.57), origin, materials["concreteDark"]),
        _cylinder("Chemical.Tank", 1.95, 6.1, (0, 0, 3.43), origin, materials["equipmentLight"], 40, 0.035),
        _cylinder("Chemical.TankBand.0", 2.01, 0.14, (0, 0, 1.42), origin, materials["steel"], 36, 0.01),
        _cylinder("Chemical.TankBand.1", 2.01, 0.14, (0, 0, 3.60), origin, materials["steel"], 36, 0.01),
        _cylinder("Chemical.TankBand.2", 2.01, 0.14, (0, 0, 5.55), origin, materials["steel"], 36, 0.01),
        _dome("Chemical.Dome", 1.98, (0, 0, 6.52), origin, materials["equipment"]),
        _part("Chemical.Mixer", (0.62, 0.62, 0.72), (0, 0, 7.18), origin, materials["equipment"]),
        _cylinder("Chemical.MixerShaft", 0.08, 5.0, (0, 0, 4.48), origin, materials["steel"], 12),
        _part("Chemical.MixerPaddle", (1.55, 0.14, 0.36), (0, 0, 2.02), origin, materials["steelDark"]),
        _part("Chemical.DosingSkid", (1.85, 1.35, 0.62), (1.80, -1.75, 0.55), origin, materials["equipment"]),
        _pipe("Chemical.DosingLine", ((1.85, -1.85, 0.90), (1.85, -1.85, 1.52), (0.45, -1.85, 1.52), (0.45, -1.0, 1.52)), origin, materials["safety"], 0.055),
        _cylinder("Chemical.Riser", 0.13, 3.0, (2.28, 0.85, 2.45), origin, materials["safety"], 16),
    ]
    for index in range(4):
        parts.append(_cylinder(
            f"Chemical.BundDrain.{index}",
            0.11,
            0.08,
            (-2.1 + index * 1.4, -3.0, 1.05),
            origin,
            materials["steelDark"],
            14,
        ))
    parts.append(add_ladder(
        "Chemical.ServiceLadder",
        origin[0] + 2.10,
        origin[1] - 2.65,
        6.5,
        materials["safety"],
        origin[2],
    ))
    return parts


def build_analyzer(item, materials):
    origin = _origin(item)
    parts = [
        _part("Analyzer.Base", (1.3, 1.0, 0.26), (0, 0, 0.13), origin, materials["concrete"]),
        _part("Analyzer.Cabinet", (1.05, 0.78, 2.1), (0, 0, 1.24), origin, materials["equipment"]),
        _part("Analyzer.Screen", (0.58, 0.05, 0.42), (0, -0.41, 1.76), origin, materials["glass"], 0.02),
        _part("Analyzer.Door", (0.82, 0.05, 1.25), (0, -0.42, 1.02), origin, materials["equipmentLight"], 0.015),
        _cylinder("Analyzer.SampleProbe", 0.08, 1.25, (0, 0, 2.75), origin, materials["steel"], 14),
        _pipe("Analyzer.SampleLine", ((0, 0, 3.1), (0, -0.75, 3.1), (0, -0.75, 2.35), (-0.3, -0.75, 2.35)), origin, materials["water"], 0.035),
        _cylinder("Analyzer.StatusLight", 0.11, 0.16, (0.38, -0.42, 2.36), origin, materials["safety"], 16),
        _part("Analyzer.SignalJunction", (0.42, 0.24, 0.42), (0.95, 0, 1.28), origin, materials["steelDark"]),
    ]
    return parts


def build_sludge_thickener(item, materials):
    origin = _origin(item)
    radius = 6.2
    parts = [
        _part("Thickener.Foundation", (13.5, 13.5, 0.38), (0, 0, 0.19), origin, materials["concrete"]),
        _cylinder("Thickener.Water", 5.85, 0.08, (0, 0, 3.80), origin, materials["sludge"], 36, 0.005),
    ]
    parts.extend(_tank_shell(
        "Thickener",
        radius,
        4.2,
        origin,
        materials["concrete"],
        segments=24,
        wall=0.34,
        z_base=0.28,
    ))
    parts.extend(_ring_band(
        "Thickener.Weir",
        5.35,
        0.30,
        3.92,
        origin,
        materials["steel"],
        segments=24,
        thickness=0.08,
    ))
    parts.extend([
        _cylinder("Thickener.CenterWell", 1.22, 3.7, (0, 0, 2.20), origin, materials["concreteDark"], 28),
        _cylinder("Thickener.Drive", 0.82, 0.9, (0, 0, 4.62), origin, materials["equipment"], 24),
        _part("Thickener.Bridge", (12.1, 1.10, 0.18), (0, 0, 4.78), origin, materials["steel"]),
        _part("Thickener.ScraperArm.A", (10.8, 0.20, 0.26), (1.8, 0, 0.72), origin, materials["steelDark"], rotation=(0, 0, 0.65)),
        _part("Thickener.ScraperArm.B", (10.8, 0.20, 0.26), (-1.8, 0, 0.72), origin, materials["steelDark"], rotation=(0, 0, 0.65)),
        _pipe("Thickener.SupernatantPipe", ((4.8, -0.8, 4.02), (7.0, -0.8, 4.02), (7.0, -0.8, 0.52)), origin, materials["sludge"], 0.16),
    ])
    parts.append(add_ladder("Thickener.Ladder", origin[0] + 6.4, origin[1], 4.7, materials["safety"], origin[2]))
    for side in (-1, 1):
        parts.append(_part(
            f"Thickener.BridgeRail.{side}",
            (12.2, 0.09, 0.09),
            (0, side * 0.50, 5.82),
            origin,
            materials["safety"],
        ))
        parts.extend(_rail_segments(
            f"Thickener.RimRail.{side}",
            (-5.7, side * 5.85),
            (5.7, side * 5.85),
            4.55,
            origin,
            materials["safety"],
        ))
    return parts


def build_sludge_dewatering(item, materials):
    origin = _origin(item)
    parts = [
        _part("Dewatering.Foundation", (14.0, 8.0, 0.36), (0, 0, 0.18), origin, materials["concrete"]),
        _cylinder("Dewatering.SludgeTank", 1.55, 2.7, (-5.0, 1.8, 1.52), origin, materials["equipment"], 28),
        _dome("Dewatering.SludgeTankDome", 1.55, (-5.0, 1.8, 2.88), origin, materials["equipmentLight"]),
        _part("Dewatering.FlocTank", (3.0, 2.6, 2.0), (-2.4, 1.8, 1.18), origin, materials["equipmentLight"]),
        _cylinder("Dewatering.FlocMixer", 0.30, 0.56, (-2.4, 1.8, 2.56), origin, materials["equipment"], 20),
        _part("Dewatering.PolymerSkid", (1.8, 1.5, 0.75), (-2.6, -1.8, 0.74), origin, materials["equipment"]),
        _cylinder("Dewatering.PolymerTank", 0.72, 1.7, (-4.2, -1.9, 1.38), origin, materials["equipmentLight"], 24),
        _cylinder("Dewatering.ScrewPress", 0.68, 4.3, (1.8, 0.7, 1.32), origin, materials["steel"], 28, rotation=(0, math.pi / 2, 0)),
        _part("Dewatering.PressFrame", (4.7, 1.6, 0.28), (1.7, 0.7, 0.70), origin, materials["steelDark"]),
        _cylinder("Dewatering.PressMotor", 0.40, 0.90, (4.35, 0.7, 1.36), origin, materials["equipment"], 24, rotation=(0, math.pi / 2, 0)),
        _pipe("Dewatering.SprayWater", ((-1.5, -1.5, 2.62), (3.7, -1.5, 2.62)), origin, materials["water"], 0.07),
        _part("Dewatering.CakeConveyor", (4.0, 0.82, 0.32), (2.2, -1.4, 0.62), origin, materials["equipment"], rotation=(0, -0.18, 0)),
        _part("Dewatering.ControlCabinet", (1.25, 0.68, 1.9), (5.35, -2.15, 1.26), origin, materials["equipmentLight"]),
    ]
    for index in range(8):
        parts.append(_part(
            f"Dewatering.ConveyorRoller.{index:02d}",
            (0.08, 0.90, 0.08),
            (0.6 + index * 0.42, -1.4, 0.80 + index * 0.075),
            origin,
            materials["steelDark"],
        ))
    for index in range(5):
        parts.append(_pipe(
            f"Dewatering.SprayNozzle.{index:02d}",
            ((-1.0 + index * 1.1, -1.5, 2.59), (-1.0 + index * 1.1, -1.5, 2.35)),
            origin,
            materials["water"],
            0.025,
        ))
    return parts


def build_sludge_dryer(item, materials):
    origin = _origin(item)
    parts = [
        _part("Dryer.Foundation", (10.5, 6.5, 0.36), (0, 0, 0.18), origin, materials["concrete"]),
        _part("Dryer.Chamber", (7.6, 3.2, 2.5), (0, 0.6, 1.62), origin, materials["equipment"], 0.10),
        _part("Dryer.AccessDoor", (1.25, 0.08, 1.65), (-1.9, -1.02, 1.56), origin, materials["equipmentLight"]),
        _part("Dryer.ControlCabinet", (1.4, 0.7, 2.1), (4.4, -2.0, 1.42), origin, materials["equipmentLight"]),
        _part("Dryer.CakeConveyor", (8.0, 0.9, 0.34), (0, -2.2, 0.65), origin, materials["steelDark"], rotation=(0, -0.12, 0)),
        _cylinder("Dryer.ExhaustStack.A", 0.31, 4.7, (-2.6, 1.8, 3.55), origin, materials["steel"], 20),
        _cylinder("Dryer.ExhaustStack.B", 0.31, 4.7, (2.6, 1.8, 3.55), origin, materials["steel"], 20),
        _pipe("Dryer.HeatHeader", ((-4.6, 0.6, 2.6), (-4.6, 0.6, 3.0), (4.6, 0.6, 3.0)), origin, materials["air"], 0.14),
    ]
    for index in range(8):
        parts.append(_part(
            f"Dryer.ConveyorRoller.{index:02d}",
            (0.08, 1.0, 0.09),
            (-3.3 + index * 0.95, -2.2, 0.84),
            origin,
            materials["steelDark"],
        ))
    return parts


def build_sludge_storage(item, materials):
    origin = _origin(item)
    parts = [
        _part("Storage.Foundation", (6.6, 6.6, 0.4), (0, 0, 0.2), origin, materials["concrete"]),
        _cylinder("Storage.Silo", 2.65, 7.0, (0, 0, 4.45), origin, materials["equipmentLight"], 32, 0.045),
        _dome("Storage.SiloTop", 2.64, (0, 0, 7.95), origin, materials["equipment"]),
        _cone("Storage.Hopper", 0.78, 2.63, 2.4, (0, 0, 1.52), origin, materials["equipment"]),
        _cylinder("Storage.Discharge", 0.42, 1.1, (0, 0, 0.75), origin, materials["steelDark"], 20),
        _cylinder("Storage.TopVent", 0.26, 0.75, (0.7, 0, 8.95), origin, materials["steel"], 18),
    ]
    for index in range(4):
        angle = index * math.pi / 2
        parts.append(_part(
            f"Storage.Support.{index}",
            (0.20, 0.20, 2.5),
            (1.85 * math.cos(angle), 1.85 * math.sin(angle), 1.65),
            origin,
            materials["steelDark"],
        ))
    parts.append(add_ladder("Storage.Ladder", origin[0] + 2.9, origin[1], 7.9, materials["safety"], origin[2]))
    return parts


def build_conveyor(item, materials):
    origin = _origin(item)
    parts = [
        _part("Conveyor.Frame", (11.0, 0.85, 0.34), (0, 0, 1.72), origin, materials["steelDark"], rotation=(0, -0.16, 0)),
        _part("Conveyor.Belt", (10.8, 0.62, 0.08), (0, 0, 1.94), origin, materials["rubber"], 0.01, rotation=(0, -0.16, 0)),
        _part("Conveyor.Discharge", (1.25, 1.0, 1.25), (5.7, 0, 2.28), origin, materials["equipment"]),
        _part("Conveyor.DriveGuard", (0.85, 0.95, 0.65), (-5.35, 0, 1.95), origin, materials["safety"]),
    ]
    for index in range(15):
        x = -5.0 + index * 0.72
        parts.append(_part(
            f"Conveyor.Roller.{index:02d}",
            (0.08, 0.92, 0.08),
            (x, 0, 1.96 - x * 0.16),
            origin,
            materials["steel"],
        ))
    for index in range(6):
        x = -5.0 + index * 1.9
        parts.append(_part(
            f"Conveyor.Support.{index:02d}",
            (0.14, 0.14, 1.35),
            (x, 0, 0.80 - x * 0.08),
            origin,
            materials["steelDark"],
        ))
    return parts


def build_digester(item, materials):
    origin = _origin(item)
    radius = 5.6
    parts = [
        _part("Digester.Foundation", (12.2, 12.2, 0.46), (0, 0, 0.23), origin, materials["concrete"]),
    ]
    parts.extend(_tank_shell(
        "Digester",
        radius,
        7.4,
        origin,
        materials["concrete"],
        segments=26,
        wall=0.40,
        z_base=0.38,
    ))
    parts.extend(_ring_band(
        "Digester.MaintenanceRing",
        5.92,
        0.24,
        7.70,
        origin,
        materials["steel"],
        segments=26,
        thickness=0.52,
    ))
    parts.extend([
        _dome("Digester.GasDome", 5.55, (0, 0, 7.86), origin, materials["equipmentLight"], 0.38),
        _cylinder("Digester.GasPipe", 0.18, 5.3, (3.2, 0, 10.15), origin, materials["steel"], 18),
        _part("Digester.GasPipeArm", (3.8, 0.28, 0.28), (1.5, 0, 10.15), origin, materials["steel"]),
        _cylinder("Digester.PressureRelief", 0.34, 0.7, (-1.1, 0, 10.80), origin, materials["safety"], 20),
        _pipe("Digester.SludgeFeed", ((-7.0, 0, 1.25), (-5.1, 0, 1.25)), origin, materials["sludge"], 0.20),
        _pipe("Digester.SludgeOutlet", ((5.2, 0, 1.2), (7.1, 0, 1.2), (7.1, 0, 0.45)), origin, materials["sludge"], 0.18),
        _part("Digester.InspectionPlatform", (3.0, 1.0, 0.16), (0, 5.6, 9.2), origin, materials["steel"]),
        _part("Digester.PlatformRail", (3.2, 0.06, 0.06), (0, 6.05, 10.2), origin, materials["safety"]),
    ])
    parts.append(add_ladder("Digester.Ladder", origin[0] + 5.85, origin[1], 7.9, materials["safety"], origin[2]))
    parts.append(add_stairs(
        "Digester.AccessStairs",
        (origin[0] - 8.5, origin[1] + 2.0),
        1.45,
        6.2,
        7.4,
        22,
        materials["safety"],
        direction=1.0,
        z_base=origin[2],
    ))
    return parts


def build_flare(item, materials):
    origin = _origin(item)
    parts = [
        _part("Flare.Base", (3.6, 3.6, 0.35), (0, 0, 0.18), origin, materials["concrete"]),
        _cylinder("Flare.Stack.Lower", 0.38, 5.8, (0, 0, 3.25), origin, materials["steelDark"], 24),
        _cylinder("Flare.Stack.Upper", 0.27, 3.8, (0, 0, 7.70), origin, materials["steel"], 22),
        _dome("Flare.Tip", 0.34, (0, 0, 9.62), origin, materials["equipmentLight"], 0.35),
        _pipe("Flare.GasLine", ((-6.2, 0, 1.0), (-3.2, 0, 1.0), (-1.1, 0, 2.2)), origin, materials["sludge"], 0.16),
        _cylinder("Flare.IsolationValve", 0.24, 0.35, (-3.1, 0, 1.02), origin, materials["safety"], 18),
    ]
    for index in range(3):
        angle = index * 2 * math.pi / 3
        parts.append(_part(
            f"Flare.Tripod.{index}",
            (0.15, 0.15, 6.4),
            (1.05 * math.cos(angle), 1.05 * math.sin(angle), 3.2),
            origin,
            materials["steelDark"],
            rotation=(0.0, 0.18, angle),
        ))
    for index, height in enumerate((2.4, 4.8, 6.5)):
        parts.extend(_ring_band(
            f"Flare.MaintenanceRing.{index}",
            0.72 if index == 2 else 0.50,
            0.10,
            height,
            origin,
            materials["steel"],
            segments=12,
            thickness=0.055,
        ))
    return parts


def build_uv(item, materials):
    origin = _origin(item)
    parts = [
        _part("UV.Base", (13.0, 5.4, 0.42), (0, 0, 0.21), origin, materials["concrete"]),
        _part("UV.Wall.N", (13.0, 0.34, 1.70), (0, 2.52, 1.05), origin, materials["concrete"]),
        _part("UV.Wall.S", (13.0, 0.34, 1.70), (0, -2.52, 1.05), origin, materials["concrete"]),
        _part("UV.Water", (12.1, 4.55, 0.07), (0, 0, 1.02), origin, materials["water"], 0.005),
        _part("UV.ControlCabinet", (1.35, 0.80, 2.0), (5.55, -3.45, 1.30), origin, materials["equipmentLight"]),
        _part("UV.WipingFrame", (9.8, 0.34, 0.34), (0, 0, 2.16), origin, materials["steelDark"]),
        _pipe("UV.Intake", ((-6.9, 0, 1.0), (-5.9, 0, 1.0)), origin, materials["water"], 0.18),
        _pipe("UV.Outlet", ((5.9, 0, 1.0), (7.1, 0, 1.0)), origin, materials["water"], 0.18),
    ]
    for bank in range(7):
        x = -4.5 + bank * 1.5
        for lamp in range(4):
            y = -1.5 + lamp
            parts.append(_cylinder(
                f"UV.Bank.{bank}.Lamp.{lamp}",
                0.065,
                3.2,
                (x, y, 1.70),
                origin,
                materials["equipmentLight"],
                12,
                0.003,
            ))
            parts.append(_cylinder(
                f"UV.Bank.{bank}.Sleeve.{lamp}",
                0.10,
                3.35,
                (x, y, 1.70),
                origin,
                materials["glass"],
                12,
                0.002,
            ))
        parts.append(_part(
            f"UV.Bank.{bank}.Frame",
            (0.16, 3.7, 0.15),
            (x, 0, 3.23),
            origin,
            materials["steel"],
        ))
    return parts


def build_emergency_basin(item, materials):
    origin = _origin(item)
    parts = _tank("Emergency", 10.5, 8.0, 2.7, origin, materials)
    parts.extend([
        _part("Emergency.Bridge", (0.70, 8.3, 0.16), (0, 0, 3.12), origin, materials["steel"]),
        _part("Emergency.Mixer", (0.72, 0.72, 0.64), (3.8, 0, 3.48), origin, materials["equipment"]),
        _pipe("Emergency.Drain", ((4.8, -3.5, 1.0), (6.1, -3.5, 1.0), (6.1, -3.5, 0.45)), origin, materials["water"], 0.16),
    ])
    parts.append(add_ladder("Emergency.Ladder", origin[0] + 5.4, origin[1], 2.8, materials["safety"], origin[2]))
    return parts


def build_valve(item, materials):
    origin = _origin(item)
    parts = [
        _part("Valve.Foundation", (2.2, 2.2, 0.28), (0, 0, 0.14), origin, materials["concrete"]),
        _cylinder("Valve.Body", 0.52, 0.55, (0, 0, 0.82), origin, materials["equipment"], 28),
        _cylinder("Valve.Flange.W", 0.66, 0.14, (-0.55, 0, 0.82), origin, materials["steel"], 24, rotation=(0, math.pi / 2, 0)),
        _cylinder("Valve.Flange.E", 0.66, 0.14, (0.55, 0, 0.82), origin, materials["steel"], 24, rotation=(0, math.pi / 2, 0)),
        _cylinder("Valve.Stem", 0.075, 1.25, (0, 0, 1.55), origin, materials["steel"], 12),
        _cylinder("Valve.Handwheel", 0.40, 0.08, (0, 0, 2.18), origin, materials["safety"], 24),
        _pipe("Valve.Inlet", ((-2.0, 0, 0.82), (-0.65, 0, 0.82)), origin, materials["water"], 0.22),
        _pipe("Valve.Outlet", ((0.65, 0, 0.82), (2.0, 0, 0.82)), origin, materials["water"], 0.22),
    ]
    return parts


BUILDERS = {
    "inlet": build_inlet,
    "bar-screen": build_bar_screen,
    "pump": build_pump,
    "grit-basin": build_grit_basin,
    "grit-classifier": build_grit_classifier,
    "rectangular-clarifier": build_rectangular_clarifier,
    "distribution-well": build_distribution_well,
    "biological-reactor": build_biological_reactor,
    "circular-clarifier": build_circular_clarifier,
    "blower": build_blower,
    "coagulation-basin": build_coagulation_basin,
    "filter-cell": build_filter_cell,
    "contact-basin": build_contact_basin,
    "membrane-basin": build_membrane_basin,
    "chemical-tank": build_chemical_tank,
    "analyzer": build_analyzer,
    "sludge-thickener": build_sludge_thickener,
    "sludge-dewatering": build_sludge_dewatering,
    "sludge-dryer": build_sludge_dryer,
    "sludge-storage": build_sludge_storage,
    "conveyor": build_conveyor,
    "digester": build_digester,
    "flare": build_flare,
    "uv": build_uv,
    "emergency-basin": build_emergency_basin,
    "valve": build_valve,
}


def build_equipment(item, materials):
    stage_materials = {
        **materials,
        "equipment": materials.get(
            f"stage:{item['stage']}",
            materials["equipment"],
        ),
    }
    builder = BUILDERS.get(item["kind"])
    if builder is None:
        origin = _origin(item)
        parts = [
            _part(
                "Placeholder.Base",
                (4.0, 3.0, 0.4),
                (0, 0, 0.2),
                origin,
                materials["concrete"],
            ),
            _part(
                "Placeholder.Body",
                (3.0, 2.3, 2.0),
                (0, 0, 1.4),
                origin,
                stage_materials["equipment"],
            ),
        ]
    else:
        parts = builder(item, stage_materials)
    parts.extend(_port_fixtures(item, stage_materials))
    joined = join_parts(parts, item["tag"])
    for polygon in joined.data.polygons:
        polygon.use_smooth = False
    return joined
