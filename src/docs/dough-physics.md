Mochi Soft Body Physics Specification

Core Philosophy

Mochi is dough, not a balloon. The key distinction:

- Balloon: Bouncy, elastic, springs back instantly, stores energy
- Mochi: Absorbs energy, deforms plastically, recovers slowly, feels heavy and tacky

The Five Laws of Mochi Physics

1. Energy Absorption (Dead Energy)
   When mochi collides with anything, it should absorb most kinetic energy rather than bounce. Impact creates deformation, not rebound. A dropped mochi should  
   "splat" and settle, not bounce repeatedly. Wall bounce coefficient should be very low (0.1-0.3).

2. Viscous Damping
   All motion should feel sluggish and heavy. Springs between vertices need viscous damping on their relative velocity, not just position-based forces. This  
   prevents the "flapping" oscillation that makes soft bodies feel like balloons. Formula: dampingForce = relativeVelocity \* dampingCoefficient

3. Non-Linear Pressure (Soft Core)
   Mochi has a soft exterior but resists extreme compression. Use area-based pressure that increases exponentially as the mochi compresses:

- At 100% area: no pressure (at rest)
- At 85% area: moderate pressure
- At 60% area: strong pressure (exponential response)
- Below 50%: emergency damping to prevent explosion

This creates the feeling of squishing into something that has a resistant core.

4. Stiction (Tacky Friction)
   Mochi is sticky. At low velocities, friction should approach 1.0 (complete stop). At higher velocities, use normal dynamic friction. This creates:

- Mochi that "sticks" to the floor when resting
- No sliding/drifting when at rest
- Natural settling behavior

5. Surface Deformation, Not Center Translation
   When two mochi collide, their surfaces should deform and flatten against each other. Don't just push the centers apart like rigid circles. Individual vertices
   that penetrate another mochi should be pushed back to the surface, creating visible deformation at the contact point.

Critical Implementation Details

Vertex-to-Polygon Collision
Use ray casting to detect when vertices penetrate another mochi's polygon. Push penetrating vertices back to the surface along the edge normal. This is more  
 accurate than center-distance checks and creates realistic surface deformation.

Pressure Applied to Edge Normals
Don't push vertices radially from center. Instead, calculate edge normals and apply pressure force perpendicular to each edge. This maintains correct shape  
 under compression.

Velocity Clamping
Clamp maximum vertex velocity (e.g., 25 units/frame) to prevent physics explosions when forces accumulate.

Settling/Sleep System
When mochi velocity drops below threshold AND no overlaps exist, zero all velocities completely. This prevents micro-jitter at rest. But don't sleep if  
 overlaps remain - keep resolving.

Size-Dependent Stiffness
Smaller mochi should be relatively stiffer than larger ones. Otherwise large mochi will completely flatten small ones. Scale spring stiffness and pressure  
 response inversely with tier/size.

What to Avoid

1. High bounce coefficients - Makes mochi feel like rubber balls
2. Position-only springs - Creates oscillation without viscous damping
3. Radial pressure from center - Creates incorrect deformation patterns
4. Aggressive collision corrections - Causes jitter and instability
5. Center-only collision detection - Misses surface deformation
6. Constant outward pressure - Should only apply when compressed below target area

The Feel Test

A correctly implemented mochi should:

- Drop and settle quickly without bouncing
- Squish visibly when stacked under weight
- Feel heavy and substantial, not floaty
- Stay perfectly still when at rest (no jitter)
- Deform at contact points, not just translate
- Slowly recover shape after compression

---

This specification prioritizes stability and feel over physical accuracy. Real-time game physics that feels like mochi is more important than a physically  
 correct simulation.
