# Formalization

External proof assistants and model checkers are evidence producers rather than
implicit members of the trusted kernel.

Each adapter should record:

- normalized source obligation;
- translation;
- imported axioms;
- tool and version;
- certificate or proof artifact;
- exact contract identity;
- trust boundary.

Candidate tracks include a small mechanization of the core metatheory and
bounded models of actor and STM runtime protocols.
