"""
CareOps — WhatsApp Bridge Manager
Automates the startup and monitoring of the Node.js WhatsApp bridge.
"""

import logging
import os
import signal
import subprocess
import time
from pathlib import Path

logger = logging.getLogger(__name__)

class BridgeManager:
    """Manages the WhatsApp bridge process lifespan."""

    @staticmethod
    def is_bridge_running(port: int = 3001) -> bool:
        """Check if the bridge is already running on the specified port."""
        try:
            # Check for a process listening on the bridge port
            result = subprocess.run(
                ["lsof", "-i", f":{port}", "-t"],
                capture_output=True,
                text=True,
                check=False
            )
            return bool(result.stdout.strip())
        except Exception as e:
            logger.warning("Failed to check if bridge is running: %s", e)
            return False

    @staticmethod
    def start_bridge(workspace_root: Path):
        """Start the WhatsApp bridge in the background."""
        bridge_dir = workspace_root / "whatsapp-bridge"
        if not bridge_dir.exists():
            logger.error("WhatsApp bridge directory not found at %s", bridge_dir)
            return

        # Check if already running
        if BridgeManager.is_bridge_running():
            logger.info("📱 WhatsApp bridge is already running.")
            return

        logger.info("🚀 Starting WhatsApp bridge...")
        
        # Determine the command based on environment
        # In dev, we use npm run dev.
        # We redirect output to a log file.
        log_file = bridge_dir / "bridge_auto.log"
        
        try:
            # We use Popen to start it in the background
            # We use a shell command to handle the directory change and background execution
            process = subprocess.Popen(
                ["npm", "run", "dev"],
                cwd=str(bridge_dir),
                stdout=open(log_file, "a"),
                stderr=subprocess.STDOUT,
                preexec_fn=os.setsid # Create a new process group so it doesn't die with the parent
            )
            logger.info("📱 WhatsApp bridge started in background (PID: %d)", process.pid)
        except Exception as e:
            logger.error("❌ Failed to start WhatsApp bridge: %s", e)

    @staticmethod
    def stop_bridge(port: int = 3001):
        """Stop the bridge process if it's running."""
        try:
            result = subprocess.run(
                ["lsof", "-i", f":{port}", "-t"],
                capture_output=True,
                text=True,
                check=False
            )
            pids = result.stdout.strip().split("\n")
            for pid in pids:
                if pid:
                    logger.info("🛑 Stopping WhatsApp bridge (PID: %s)", pid)
                    os.kill(int(pid), signal.SIGTERM)
        except Exception as e:
            logger.warning("Failed to stop bridge: %s", e)
