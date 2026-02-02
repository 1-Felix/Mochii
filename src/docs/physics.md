Soft Body Mochi Physics: Implementation Guide  
 Overview
This is a 2D soft body physics system for a Suika-style game where blob-like "mochi" fall, stack, deform, and merge. The goal is to create soft, squishy
objects that feel like real mochi - NOT bouncy balloons.

---

Core Architecture

Each mochi is a polygon defined by vertices (16-32 points arranged in a circle), connected by springs that maintain shape. The soft body behavior comes from  
 three competing forces:

1. Gravity - pulls vertices down
2. Springs - try to maintain distances between vertices
3. Pressure - pushes vertices outward to maintain volume

   Points arranged in circle
   ●───●───●
   / | \
    ● | ● ← Springs connect adjacent points,
   | CENTER | skip-1 points, and opposite points
   ● | ●
   \ | /
   ●───●───●

---

The Simulation Loop (Order Matters!)

1. PHYSICS FORCES (per mochi)
   - Apply gravity to all vertices
   - Apply spring forces (with viscous damping)
   - Apply pressure forces (gas model)
   - Update velocities and positions
   - Handle container collisions (walls, floor)

2. COLLISION CONSTRAINTS (between mochi pairs)
   - Detect vertex-in-polygon penetration
   - Detect edge-edge intersection
   - Apply position corrections
   - Apply velocity corrections
   - Check for merge conditions

3. POST-PROCESSING
   - Area conservation (gentle expansion if over-compressed)
   - Settling/sleep (zero velocities when nearly still)

PITFALL #1: Running collision detection DURING physics updates causes instability. Always separate physics integration from collision resolution. Run all  
 physics first, THEN resolve all collisions.

---

Spring System

Three types of springs per mochi:

// Edge springs - connect adjacent vertices
for (i = 0; i < numPoints; i++) {
springs.push({ p1: i, p2: (i+1) % numPoints, stiffness: 0.5 });
}

// Skip springs - connect every other vertex (prevents folding)
for (i = 0; i < numPoints; i++) {
springs.push({ p1: i, p2: (i+2) % numPoints, stiffness: 0.3 });
}

// Cross springs - connect opposite vertices (maintains roundness)
for (i = 0; i < numPoints/2; i++) {
springs.push({ p1: i, p2: i + numPoints/2, stiffness: 0.15 });
}

PITFALL #2: Springs alone create bouncy, oscillating behavior. You MUST add viscous damping to the spring forces:

// Standard spring force
const displacement = currentLength - restLength;
const springForce = displacement \* stiffness;

// CRITICAL: Add viscous damping on relative velocity
const relativeVelocity = dot(p2.vel - p1.vel, springDirection);
const dampingForce = relativeVelocity \* dampingCoefficient; // 0.1-0.15

// Apply combined force
p1.vel += (springForce + dampingForce) _ direction;
p2.vel -= (springForce + dampingForce) _ direction;

Without this damping, the mochi will "flap" and oscillate indefinitely.

---

Pressure System (Gas Model)

This is what makes mochi feel squishy rather than like a bag of springs. Based on the Ideal Gas Law: as volume decreases, pressure increases.

function applyPressure(mochi) {
const currentArea = calculatePolygonArea(mochi.points);
const targetArea = mochi.baseArea;

    // Pressure inversely proportional to area
    let pressure = basePressure * (targetArea / currentArea);

    // NON-LINEAR response when compressed (soft core resistance)
    if (currentArea < targetArea) {
      const compressionRatio = currentArea / targetArea;
      pressure *= Math.pow(1 / compressionRatio, exponent); // exponent ~1.2-1.8
    }

    // Apply pressure along EDGE NORMALS, not radially from center
    for (each edge) {
      const normal = perpendicular(edge); // pointing outward
      const force = pressure * edgeLength;
      edge.p1.vel += normal * force * 0.5;
      edge.p2.vel += normal * force * 0.5;
    }

}

PITFALL #3: Applying pressure radially from center causes unnatural deformation. Apply it along edge normals instead - this makes the mochi expand
perpendicular to its surface, which looks correct when squished against a flat surface.

PITFALL #4: Pressure can fight against collision response, causing jitter. When a vertex is in contact with another mochi, DON'T apply pressure force in the  
 direction of that contact:

// If vertex is touching another mochi's surface...
const contactNormal = directionToOtherMochiSurface;
const pressureForce = calculatePressureForce();

// Remove component pushing INTO the contact
const forceIntoContact = dot(pressureForce, contactNormal);
if (forceIntoContact > 0) {
pressureForce -= contactNormal \* forceIntoContact;
}

---

Collision Detection

Use THREE methods together for robust detection:

1. Vertex-in-Polygon (Ray Casting)

function pointInPolygon(px, py, polygon) {
let inside = false;
for (let i = 0, j = n-1; i < n; j = i++) {
if ((polygon[i].y > py) !== (polygon[j].y > py) &&
px < (polygon[j].x - polygon[i].x) \* (py - polygon[i].y)
/ (polygon[j].y - polygon[i].y) + polygon[i].x) {
inside = !inside;
}
}
return inside;
}

2. Edge-Edge Intersection

Catches cases where edges cross but no vertices are inside:
function edgesIntersect(a1, a2, b1, b2) {
// Standard line segment intersection test
// Returns intersection point if segments cross
}

3. Center-Distance Check

Fallback that catches any remaining overlap:
const centerDist = distance(m1.center, m2.center);
const minDist = m1.radius + m2.radius;
if (centerDist < minDist) {
// Push apart based on overlap
}

PITFALL #5: Using ONLY center-distance allows deep vertex penetration. Soft bodies can deform such that vertices penetrate deeply while centers remain far  
 apart. You need vertex-level detection.

---

Collision Response

When penetration is detected, you need to:

1. Push the vertex out (position correction)
2. Kill velocity going into the other mochi (velocity correction)

if (pointInPolygon(vertex, otherMochi)) {
// Find closest point on other mochi's surface
const closest = closestPointOnPolygon(vertex, otherMochi);
const penetrationDepth = closest.distance;
const pushDirection = normalize(closest.point - vertex.position);

    // Position correction - GENTLE factor to prevent oscillation
    const correction = (penetrationDepth + margin) * 0.6; // NOT 1.0!
    vertex.position += pushDirection * correction;

    // Velocity correction - remove component going INTO other mochi
    const velIntoOther = dot(vertex.velocity, -pushDirection);
    if (velIntoOther > 0) {
      vertex.velocity += pushDirection * velIntoOther;
    }

    // General damping
    vertex.velocity *= 0.85;

}

PITFALL #6: Aggressive position corrections cause oscillation. If you push a vertex out by 100% of penetration, it often overshoots and penetrates from the  
 other side next frame. Use a factor of 0.5-0.7 and rely on multiple iterations.

PITFALL #7: Not killing penetrating velocity causes immediate re-penetration. The vertex will just move back into the other mochi next frame.

---

Merge Detection

Same-tier mochi should merge when touching. But detecting "touching" is tricky with soft bodies:

function shouldMerge(m1, m2) {
if (m1.tier !== m2.tier) return false;
if (m1.tier >= maxTier) return false;

    // DON'T merge if either is severely compressed (physics glitch)
    const m1Stability = calculateArea(m1) / m1.baseArea;
    const m2Stability = calculateArea(m2) / m2.baseArea;
    if (m1Stability < 0.55 || m2Stability < 0.55) return false;

    // DON'T merge if recently created from another merge (prevents chains)
    if (m1.mergeImmunity > 0 || m2.mergeImmunity > 0) return false;

    // Merge when centers are close enough (surfaces touching)
    const centerDist = distance(m1.center, m2.center);
    const touchingDist = (m1.radius + m2.radius) * 1.15;
    return centerDist < touchingDist;

}

PITFALL #8: Chain reaction merges. When mochi A and B merge, the resulting larger mochi can immediately collide with nearby mochi C, causing them to deform and
potentially glitch-merge with mochi D. Solution: Add a mergeImmunity timer (15-45 frames) on newly created mochi.

PITFALL #9: Glitch-induced false merges. When physics becomes unstable, mochi can overlap incorrectly. The system then thinks they're "touching" and merges  
 them. Solution: Check area stability before allowing merge - if a mochi is severely compressed (< 55% of base area), it's glitching and should not merge.

---

Stability Systems

These prevent the physics from exploding:

1. Velocity Clamping

const maxVelocity = 25;
for (const point of mochi.points) {
const speed = length(point.velocity);
if (speed > maxVelocity) {
point.velocity \*= maxVelocity / speed;
}
}

2. Emergency Damping

const compressionRatio = currentArea / baseArea;
if (compressionRatio < 0.5) {
// Severely compressed - emergency brake
for (const point of mochi.points) {
point.velocity \*= 0.7;
}
}

3. Area Conservation

// If mochi is over-compressed, gently expand it
if (currentArea < baseArea _ 0.8) {
const scale = Math.min(1.05, Math.sqrt(baseArea / currentArea));
for (const point of mochi.points) {
point.position = center + (point.position - center) _ scale;
}
}

4. Sleep System

// When nearly still AND no overlaps, freeze completely
const maxPointSpeed = max(mochi.points.map(p => length(p.velocity)));
if (maxPointSpeed < 0.3 && !hasOverlapWithOthers(mochi)) {
for (const point of mochi.points) {
point.velocity = { x: 0, y: 0 };
}
}

PITFALL #10: Sleeping mochi that still have overlaps. They freeze in a penetrating state. Only sleep when BOTH nearly still AND no significant overlaps  
 detected.

---

Size-Dependent Tuning

Smaller mochi need stiffer physics to prevent being squashed flat by larger ones:

const tierStiffness = tier <= 1 ? 3.5 :
tier <= 2 ? 2.8 :
tier <= 3 ? 2.2 :
tier <= 4 ? 1.6 : 1.0;

// Apply to pressure exponent
pressure _= Math.pow(1/compressionRatio, exponent _ tierStiffness);

// Apply to springs
springForce \*= tierSpringMultiplier;

---

Summary of Critical Pitfalls
┌────────────────────────────────┬─────────────────────────────────┬─────────────────────────────────────────────────────┐
│ Pitfall │ Symptom │ Solution │
├────────────────────────────────┼─────────────────────────────────┼─────────────────────────────────────────────────────┤
│ No spring damping │ Endless oscillation, "flapping" │ Add viscous damping to relative velocity │
├────────────────────────────────┼─────────────────────────────────┼─────────────────────────────────────────────────────┤
│ Radial pressure │ Unnatural squish shape │ Apply along edge normals │
├────────────────────────────────┼─────────────────────────────────┼─────────────────────────────────────────────────────┤
│ Pressure fights collision │ Jitter at rest │ Contact-aware pressure (skip force toward contacts) │
├────────────────────────────────┼─────────────────────────────────┼─────────────────────────────────────────────────────┤
│ Aggressive correction │ Oscillation between sides │ Use 0.5-0.7 factor, multiple iterations │
├────────────────────────────────┼─────────────────────────────────┼─────────────────────────────────────────────────────┤
│ No velocity kill │ Immediate re-penetration │ Remove velocity component going into contact │
├────────────────────────────────┼─────────────────────────────────┼─────────────────────────────────────────────────────┤
│ Only center-distance collision │ Deep vertex penetration │ Use vertex-in-polygon + edge-edge │
├────────────────────────────────┼─────────────────────────────────┼─────────────────────────────────────────────────────┤
│ No merge immunity │ Chain reaction explosions │ Add 15-45 frame immunity after merge │
├────────────────────────────────┼─────────────────────────────────┼─────────────────────────────────────────────────────┤
│ No stability check for merge │ Glitchy false merges │ Block merge if area < 55% of base │
├────────────────────────────────┼─────────────────────────────────┼─────────────────────────────────────────────────────┤
│ No velocity clamping │ Physics explosion │ Cap at reasonable max (25) │
├────────────────────────────────┼─────────────────────────────────┼─────────────────────────────────────────────────────┤
│ Sleep with overlaps │ Frozen in penetrating state │ Only sleep when overlap-free │
└────────────────────────────────┴─────────────────────────────────┴─────────────────────────────────────────────────────┘
The key insight: most "merge bugs" or "overlap bugs" are actually symptoms of underlying physics instability. Fix the physics first, and the merge logic  
 usually works fine.
