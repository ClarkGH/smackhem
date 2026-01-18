# Lessons Learned

Purpose of this document is to log the things the human has learned in the process of building this project. This document is enitirely human written.

## How this relates to the wild world of sports

I'm a floor cleaning robot, bumping into walls, and I learn. I'm confident enough now to know that it doesn't matter what your side project is as long as you learn from it, and you can relate it to your career.

It's important that I stay flexible, as the world changes so must I. Learned helplessness is the enemy. If people have no confidence in you, do not lose confidence in yourself.

Every line of code I write, every design document I plan, relates back to software engineering en totale. The paradigms may shift, but the logic is almost always the same. With puzzle pieces, I build things I think are cool. Design patterns emerge, and a deeper understanding of the root of our technology builds.

We live in a world where trade-offs are forgotten and elitisms become rule. People forget the why of doing things and just do them because they are rules. If I'm not learning, planning, or thoughtfully building something out... and it looks like cursor's doing all the work... that's extremely bad.

Everything you do, mindfully, builds pattern recognition. Read, ask questions, get lost, and hit the wall.

## Roadblocks / Lessons

1. 3D Camera rotation.
    a. Getting the yaw/pitch to accurately change was a hurdle.
    b. Mismatching formulae and misunderstanding where the problem was took a lot of trial and error to debug. Think more practice should be done with the formulae, but for a first engine... Just using them correctly is good enough.
2. Meshing and Lighting.
    a. Remembering mesh direction in lighting is a key lesson learned.
    b. Shaders were mismatched with the way the vertices and faces were wrapping.
    c. Debugging was difficult, cursor's debug mode was minutely helpful, but killed performance and my memory. Don't think I'll rely on it.
3. WIP: Moon light is currently overpowering sunlight. Has something to do with ambience formulae.
4. Chunking. Seeded procedural generation being used first, before static files... was an incredibly helpful decision! I didn't make it, I think Gemini and ChatGPT did while I was researching and just ran with it. It made stubbing so much faster. If I make another engine I'll do it again.
5. Sun and Moon. Moon and Sun confused me. I should not have built both at the same time while over-relying on cursor. It's a slippery slope. Removing the moon and slowly debugging just the sun after 2 days resolved the problem. As I recall, the moon just worked when I brought it back in.

## Patterns / Paradigms

1. Nitty gritty formula exploration.
2. Design principles for memory and performance.
    a. I've known this, but it's best to get this written. This should be a given for anyone with a CS degree, but sometimes you SHOULD mutates objects/arrays instead of doing the crazy bloated React dev crap. React does React things, Vue does Vue things, do not extrapolate FE rules onto all Javascript code.
3. Cursor's ask mode is extremely helpful.
4. Vector and Quaternion math.
    a. Matrix multiplication is common in SE, using it is strength-building
    b. Vector based logic is going to be the new HOT thing with RAGs and etc.
5. Lots of 3D engine principles and words I didn't know I had to learn
6. Everything started with Typescript, which is a typed language. I'm working with Java and C++ at times as well, so this just bleeds more into pattern recognition.
