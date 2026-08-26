const target = process.argv[2] ?? "skills/";

console.log(`skill-lint: not yet implemented, see #13 (target: ${target})`);
console.log("skill-lint: will validate SKILL.md frontmatter against the both-hosts intersection schema");
console.log("skill-lint: will require name and description, reject name mismatched to directory");
console.log("skill-lint: will reject any frontmatter key outside name, description, license, compatibility, metadata");
process.exit(0);
