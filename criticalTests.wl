(* Batch1 - Wolfram Specific Tests *)
(* Map with level specification - 3 args, should NOT transform *)
Map[f, {1,2,3}, {2}];

(* Apply with level specification - 3 args, should NOT transform *)
Apply[Plus, {1,2,3}, {0,1}];

(* Pure function with & - should not break *)
Map[# + 1 &, {1,2,3}];

(* Slot notation inside Map *)
Map[#^2 &, {1,2,3}];

(* Batch2 - Hold Attributes *)
(* Hold prevents evaluation - transforming inside changes semantics *)
Hold[Print[Range[10]]];
HoldAll[Map[Sqrt, {1,4,9}]];

(* Batch3 - Function Definitions *)
(* Function definitions with patterns - should not be touched *)
f[x_] := Print[x];
g[x_, y_] := Map[Sqrt, {x, y}];
myFunc[list_] := Apply[Plus, list];

(* Batch4 Multiline Strings *)
(* String spanning multiple lines *)
x = "This is a
multiline string with Map[f, list] inside";

(* String with special characters *)
y = "Not[True] && And[a,b]";

(* Batch5 - Chained Postfix *)
(* Mixing existing // with new transformations *)
Map[Sqrt, Range[10]] // Sort // Print

(* Double postfix *)
Print[Sort[Range[10]]];

(* Batch6 - Edge Numbers and Symbols *)
(* Single character functions - barely saves chars *)
f[x];
g[y];

(* Numbers as arguments *)
Part[myList, 1, 2];

(* Negative index *)
Part[myList, -1];

(* Batch7 - Stress Test *)
(* All transformations on one complex line *)
Print[Not[And[Map[Sqrt, {1,4,9}], Or[a,b]]]];

(* Very deeply nested *)
Print[Sort[Map[Sqrt, Apply[Plus, Part[myList, 1]]]]];