import logging
from collections import deque
from typing import List

class InMemoryLogHandler(logging.Handler):
    def __init__(self, capacity: int = 100):
        super().__init__()
        self.capacity = capacity
        self.logs = deque(maxlen=capacity)

    def emit(self, record):
        try:
            msg = self.format(record)
            self.logs.append(msg)
        except Exception:
            self.handleError(record)

    def get_logs(self) -> List[str]:
        return list(self.logs)

# Global memory log handler
memory_log_handler = InMemoryLogHandler(capacity=100)
memory_log_handler.setFormatter(logging.Formatter(
    "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
))
