(* Test1 - Deeply Nested *)
Print[Map[Sqrt, Apply[Plus, {1,2,3}]]];

(* Test2 - Multiple Expression on logic *)
And[Or[a, b], Not[c]];

(* Test3 - Part with nested expressions *)
Part[Map[Sqrt, {1,4,9}], 2];

(* Test4 - String with brackets inside *)
x = "Map[f, list]";
y = "Not[True]";

(* Test5 - Comment in the middle of code *)
Print[Range[10]]; (* this prints numbers *)

(* Test6 - Multiple transformations on same line *)
Print[Map[Sqrt, Apply[Plus, {1,2,3}]]];
Not[And[a, b]]

(* Test7 - Empty Brackets *)
Print[];
Map[f];

(* Test8 - Already partially shortened *)
Map[Sqrt, Range[10] // Sort];
