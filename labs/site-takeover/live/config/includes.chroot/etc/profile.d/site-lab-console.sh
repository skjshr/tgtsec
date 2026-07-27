if [ -t 1 ] && [ "$(tty 2>/dev/null)" = "/dev/tty1" ]; then
  /usr/local/bin/lab-console
fi
