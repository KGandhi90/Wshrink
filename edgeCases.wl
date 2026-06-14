(* Test1 - Deeply Nested *)
Print[Sqrt /@ Plus @@ {1,2,3}];

(* Test2 - Multiple Expression on logic *)
a || b && !c;

(* Test3 - Part with nested expressions *)
Part[Sqrt /@ {1,4,9}, 2];

(* Test4 - String with brackets inside *)
x = "Map[f, list]"
y = "Not[True]"

(* Test5 - Comment in the middle of code *)
Print[Range[10]]; (* this prints numbers *)

(* Test6 - Multiple transformations on same line *)
Print[Sqrt /@ Plus @@ {1,2,3}];
!a && b;

(* Test7 - Empty Brackets *)
Print[];
Map[f];

(* Test8 - Already partially shortened *)
Map[Sqrt, Range[10] // Sort];
