# Lessons Learned

Purpose of this document is to log the things learned in the process of building this project.

## How this relates to the wild world of sports

I'm a floor cleaning robot, bumping into walls, and I learn. I'm confident enough now to know that it doesn't matter what your side project is as long as you learn from it, and you can relate it to your career. Through learning frustrations, remember grace, forgive yourself, do better.

My pattern:

Practice -> Learn -> Forget -> Get Frustrated -> Practice -> Relearn -> Forget -> Intuit Patterns

It's important that I stay flexible, as the world changes so must I. Learned helplessness is the enemy. If people have no confidence in you, do not lose confidence in yourself.

Every line of code I write, every design document I plan, relates back to software engineering en totale. The paradigms may shift, but the logic is almost always the same. With puzzle pieces, I build things I think are cool. Design patterns emerge, and a deeper understanding of the root of our technology builds.

We live in a world where trade-offs are forgotten and elitisms become rule. People forget the why of doing things and just do them because they are rules. If I'm not learning, planning, or thoughtfully building something out... and it looks like cursor's doing all the work... that's extremely bad.

Everything you do, mindfully, builds pattern recognition. Read, ask questions, get lost, and hit the wall.

## Roadblocks / Lessons

1. 3D Camera rotation.
   - Getting the yaw/pitch to accurately change was a hurdle
   - Mismatching formulae and misunderstanding where the problem was took a lot of trial and error to debug. Think more practice should be done with the formulae, but for a first engine... Just using them correctly is good enough
2. Meshing and Lighting.
   - Remembering mesh direction in lighting is a key lesson learned
   - Shaders were mismatched with the way the vertices and faces were wrapping
   - Debugging was difficult, cursor's debug mode was minutely helpful, but killed performance and my memory. Don't think I'll rely on it
3. Moon light was snapping and "overpowering" sunlight.
   - The issue came from me trying to treat two different light sources as a singular one
   - To fix we blended the colors and added a band to give the sunset and sunrise some depth
   - Currently it looks like there are still some inversions here and there on sunset (closer to the sun setting is darker than further away, which is strange). Overall it's better than it was
   - 2D lighting had a different issue. The sprite has been updated to change color based on time of day. Same light pattern we used for blending with the meshes. Since the quad is standing upright and facing us, and not straight down like the plane, we needed the normalized vector in the drawn quad
4. Chunking. Seeded procedural generation being used first, before static files... was an incredibly helpful decision! I didn't make it, I think Gemini and ChatGPT did while I was researching and just ran with it. It made stubbing so much faster. If I make another engine I'll do it again
5. Sun and Moon. Moon and Sun confused me. I should not have built both at the same time while over-relying on cursor. It's a slippery slope. Removing the moon and slowly debugging just the sun after 2 days resolved the problem. As I recall, the moon just worked when I brought it back in
6. Proteus Rabbit-hole
   - Proteus was a big inspiration
   - All it has are a height field function, a sky state, a global lighting function, a handful of instance rules, and a renderer that draws up meshes, quads, and the sky
7. Cursor/Claude conflate 2D and 3D classes
   - At some point, I started confusing Cursor. Will need to review and re-organize... but I'm not sure if it's cursor's fault. We've entered territory where my application is becoming it's own unique beast, and the web scraper doesn't or didn't fully understand visual concepts well. I don't blame it for not reading my mind
8. Nvidia driver updates may break webGL if you don't restart your computer. I learned this the hard way. Thought I broke my app.

## Patterns / Paradigms

1. Nitty gritty formula exploration
2. Design principles for memory and performance
   - I've known this, but it's best to get this written. This should be a given for anyone with a CS degree, but sometimes you SHOULD mutates objects/arrays instead of doing the crazy bloated React dev crap. React does React things, Vue does Vue things, do not extrapolate FE rules onto all Javascript code
3. Cursor's ask mode was extremely helpful for brainstorming
4. Vector and Matrix math
   - Matrix multiplication is common in SE, using it is strength-building
   - Vector based logic is going to be the new HOT thing with RAGs and etc
5. Lots of 3D engine principles and words I didn't know I had to learn
6. Everything started with Typescript, which is a typed language. I'm working with Java and C++ at times as well, so this just bleeds more into pattern recognition
7. Just because cursor recommends something doesn't mean you should let it code it out. Stay in ask mode until the context is all there. Go to plan mode if you don't know what you're doing. Only use agent mode when confident
8. Forgetting code is natural, intuiting where to go is a better skill than remembering rigid rulesets.
   - I used to get frustrated due to personal elitisms gained from listening to elitists. I have "repented"
   - I just shoved in AirBNB's styleguide instead of building my own, took some changing as some patterns were more memory efficient and AirBnB set them for React/Vue. My belief that, knowing to say "hell no" to the linter, then overriding rules with why is strengthened
   - Best advice: FIND THE TRADEOFFS, DON'T DO THINGS BECAUSE OF RIGID PATTERNS. BREAK PATTERNS WITH EXPLICIT REASON
9. Versioning the json map chunk files was a phenomenally prescient decision. I don't remember if I made it intentionally or it was recommended by an agent. Either way, it's already evolving pre-alpha and it's going to make migrating easier.
   - E.G. Version 1 had bounds set in the file, that is now determined in-code. We may have non-traversable chunk-pieces in the future, but the initial establishing hard coded ones was a naive plan.
10. Refactors can happen early or later, but there's no problem with repeating yourself as differing patterns emerge. Overthinking and future proofing generally leads to painting yourself in a corner though, so it's a slippery slope. Architectural problems from naive decisions gradually reveal themselves as progression occurs. There's a lot to clean up, but we're not close to MVP, tech debt has limited importance and should only be followed up on when its an unavoidable stumbling block for work we're actively looking into.
   - E.G. Renderer originally controlled its own collision. Since the chunk controls rendering, and rendering won't always determine collision, we've split them out. While not an easy refactor, it would have been much harder down the line. This could have easily led to a rabbit hole with more gradual improvements that bloated up the current PR. We skipped 
   - E.G. Renderer originally held debug wireframes, at some point the debug feature-set will be removed when we get to alpha. Minor lift now for less work later.
   - E.G. The 0.3.1 gameloop is controlling too many things and is growing, there's no reason to pull and refactor it until we have a more clear understanding of what the whole of the engine will form into. Right now it's amorphous and the criteria is a moving target. Makes no sense to slow down to write unit tests as a result either (which is why we're more focused on portability smoke tests for now).
