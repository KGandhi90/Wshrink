(* Wshrink Demo File *)
(* Save this file to see the extension in action *)

(* Postfix transformation *)
Print[Range[10]]

(* Map operator *)
Map[Sqrt, {1, 4, 9, 16}]

(* Apply operator *)
Apply[Plus, {1, 2, 3, 4, 5}]

(* Logical operators *)
Not[x]
And[a, b, c]
Or[x, y]

(* Part notation *)
Part[myList, 3]

(* Nested — shortens in two passes *)
Print[Map[Sqrt, {1, 4, 9}]]