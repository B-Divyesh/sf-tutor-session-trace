# Demo sandbox

Open `/demo`, or choose **Try it with sample data** on the empty notebook.
The demo contains a realistic recursive-tree lesson with public observations,
one tutor-only note, a code fragment, a recap, and two practice tasks.

Demo changes use only the `demo:tutor-session-trace:v1` localStorage key. They
never read or write the real `tutor-session-trace:v1` notebook. **Reset demo**
replaces the demo key with the original sample. **Start for real** deletes the
demo key and returns to the real notebook. Creating a server share is disabled
inside the demo.
