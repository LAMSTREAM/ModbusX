# scripts/check-palette.py — decides AC13(a), AC13(b1) and AC13(b2). Exit 0 = pass.
import re, sys
from collections import Counter

CSS = open('src/renderer/src/assets/main.css', encoding='utf-8').read()

# A declaration whose value is a literal colour (hex or rgb/hsl/oklch function).
LITERAL = re.compile(r'^\s*(--[\w-]+)\s*:\s*(?:#[0-9a-fA-F]{3,8}|(?:rgb|hsl|oklch)a?\()', re.M)
# Any custom-property declaration.
ANY = re.compile(r'^\s*(--[\w-]+)\s*:', re.M)

# The derived / theme-invariant set. Keep this list in sync with the Step 5 token
# table's final row — it is the one place the two must agree, and a token introduced
# by a later `shadcn add` must be added here or it goes unchecked.
DERIVED = {'--radius', '--popover', '--popover-foreground', '--card-foreground',
           '--secondary-foreground', '--accent-foreground', '--ring'}


def body(selector_pattern):
    """Text between the selector's opening brace and its matching close."""
    m = re.search(selector_pattern + r'\s*\{', CSS, re.M)   # re.M: '^:root' anchors per line
    if not m:
        sys.exit(f'palette block not found: {selector_pattern}')
    depth, i = 1, m.end()
    while depth:
        if CSS[i] == '{':
            depth += 1
        elif CSS[i] == '}':
            depth -= 1
        i += 1
    return CSS[m.end():i - 1]


blocks = {
    'root':       body(r'^:root(?=\s*\{)'),                      # bare :root, light
    'media_dark': body(r':root:not\(\[data-theme=.light.\]\)'),  # inside the media query
    'attr_dark':  body(r':root\[data-theme=.dark.\]'),
}

# (a) literal-valued colour tokens must be the same set in all three blocks
literal = {k: set(LITERAL.findall(v)) for k, v in blocks.items()}
sym = (literal['root'] ^ literal['media_dark']) | (literal['root'] ^ literal['attr_dark'])
print('AC13(a) symmetric difference:', sorted(sym) if sym else 'EMPTY — pass')

# (b1) derived / theme-invariant tokens must not appear in either dark block
leaks = {k: sorted(DERIVED & set(ANY.findall(v)))
         for k, v in blocks.items() if k != 'root'}
leaks = {k: v for k, v in leaks.items() if v}
print('AC13(b1) derived tokens in a dark block:', leaks if leaks else 'NONE — pass')

# (b2) ...and each must appear on bare :root EXACTLY once. Absence from the dark
# blocks is not enough: a token deleted outright, or declared twice across two bare
# :root blocks, both pass a presence-only check. Count over the whole file so a second
# bare :root block is caught too.
root_counts = Counter(ANY.findall(blocks['root']))
file_counts = Counter(ANY.findall(CSS))
wrong = {t: {'in :root': root_counts[t], 'in file': file_counts[t]}
         for t in sorted(DERIVED) if root_counts[t] != 1 or file_counts[t] != 1}
print('AC13(b2) derived tokens not declared exactly once:', wrong if wrong else 'NONE — pass')

sys.exit(1 if sym or leaks or wrong else 0)
