// three-conic-polygon-geometry reads window.THREE at import time; workers have no window.
if (typeof window === 'undefined') self.window = self
