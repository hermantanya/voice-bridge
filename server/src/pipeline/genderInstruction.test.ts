import assert from "node:assert/strict";
import test from "node:test";

import { buildGenderInstruction } from "./genderInstruction.js";

test("buildGenderInstruction is empty without gender context", () => {
  assert.equal(buildGenderInstruction(), "");
});

test("buildGenderInstruction includes speaker feminine forms", () => {
  const instruction = buildGenderInstruction("female");
  assert.match(instruction, /speaker is female/i);
  assert.match(instruction, /first-person/i);
});

test("buildGenderInstruction includes addressee masculine forms", () => {
  const instruction = buildGenderInstruction(undefined, "male");
  assert.match(instruction, /listener being spoken to is male/i);
  assert.match(instruction, /second-person/i);
});

test("buildGenderInstruction includes both speaker and addressee", () => {
  const instruction = buildGenderInstruction("female", "male");
  assert.match(instruction, /speaker is female/i);
  assert.match(instruction, /listener being spoken to is male/i);
});
