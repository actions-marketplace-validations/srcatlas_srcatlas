// Run with: node --test bench/score
// docs/accuracy.md section 6: the scorer has its own tests with hand-built graphs, so that a
// scoring bug cannot inflate a result.
import assert from "node:assert/strict";
import { test } from "node:test";
import { score } from "./score.mjs";

const node = (kind, name, over = {}) => ({ id: `${kind}:p/${name}`, kind, package: "package:p", confidence: "certain", ...over });
const edge = (from, kind, to, over = {}) => ({ from, kind, to, confidence: "certain", ...over });
const graph = (nodes, edges = []) => ({ nodes, edges });

const A = node("module", "A");
const B = node("provider", "B");
const C = node("provider", "C");
const D = node("controller", "D");
const truth = graph([A, B, C, D], [edge(A.id, "contains", B.id), edge(B.id, "injects", C.id)]);

test("perfect: everything found, nothing extra", () => {
  const r = score(truth, truth).all.total;
  assert.equal(r.precision, 1);
  assert.equal(r.recall, 1);
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.extra, []);
});

test("empty actual: recall 0, precision undefined (null), never 1", () => {
  const r = score(truth, graph([])).all.total;
  assert.equal(r.recall, 0);
  assert.equal(r.precision, null);
  assert.equal(r.missing.length, 6);
});

test("all wrong: precision 0 and recall 0", () => {
  const wrong = graph([node("module", "X"), node("provider", "Y")], [edge("module:p/X", "contains", "provider:p/Y")]);
  const r = score(truth, wrong).all.total;
  assert.equal(r.precision, 0);
  assert.equal(r.recall, 0);
  assert.equal(r.extra.length, 3);
});

test("partial: 3 of 6 found, one extra", () => {
  const actual = graph([A, B, node("provider", "Z")], [edge(A.id, "contains", B.id)]);
  const r = score(truth, actual).all.total;
  assert.equal(r.correct, 3);
  assert.equal(r.recall, 0.5); // 3 of 6
  assert.equal(r.precision, 0.75); // 3 of 4
  assert.deepEqual(r.extra, ["provider provider:p/Z"]);
});

test("a node of the right id and the wrong kind is not correct", () => {
  const actual = graph([{ ...A, kind: "provider" }]);
  assert.equal(score(truth, actual).all.total.correct, 0);
});

test("an edge needs from, kind and to to match", () => {
  const actual = graph([A, B, C], [edge(A.id, "injects", B.id), edge(B.id, "contains", C.id)]);
  assert.equal(score(truth, actual).all.byKind.contains.correct, 0);
  assert.equal(score(truth, actual).all.byKind.injects.correct, 0);
});

test("per kind numbers are separate", () => {
  const actual = graph([A, B, C, D], [edge(A.id, "contains", B.id)]);
  const { byKind } = score(truth, actual).all;
  assert.equal(byKind.injects.recall, 0);
  assert.equal(byKind.contains.recall, 1);
  assert.equal(byKind.provider.recall, 1);
});

test("certainOnly drops inferred elements from the emitted side only", () => {
  const actual = graph([A, B, { ...C, confidence: "inferred" }, D], [edge(A.id, "contains", B.id), edge(B.id, "injects", C.id)]);
  const r = score(truth, actual);
  assert.equal(r.all.total.recall, 1);
  assert.equal(r.certainOnly.total.correct, 5);
  assert.equal(r.certainOnly.total.recall, +(5 / 6).toFixed(4));
});

test("package filter keeps only that package, on both sides", () => {
  const other = node("provider", "O", { package: "package:q" });
  const actual = graph([A, B, C, D, other], [edge(A.id, "contains", B.id), edge(B.id, "injects", C.id)]);
  const r = score(truth, actual, { package: "p" }).all.total;
  assert.equal(r.precision, 1);
  assert.equal(score(truth, actual, { package: "q" }).all.total.emitted, 1);
});

test("kinds outside the scope are ignored", () => {
  const actual = graph([A, node("route", "R")]);
  assert.equal(score(truth, actual).all.total.extra.length, 0);
});
