/*
 * TRAINING-ONLY SUID helper.
 * It intentionally resolves kazekiri-report-render from PATH.
 */
#define _GNU_SOURCE
#include <errno.h>
#include <limits.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/types.h>
#include <unistd.h>

static bool resolves_nonstandard_renderer(void)
{
    const char *path_value = getenv("PATH");
    char path_copy[4096];
    char candidate[PATH_MAX];
    char *save = NULL;
    char *directory = NULL;

    if (path_value == NULL || strlen(path_value) >= sizeof(path_copy)) {
        return false;
    }
    strcpy(path_copy, path_value);

    for (directory = strtok_r(path_copy, ":", &save);
         directory != NULL;
         directory = strtok_r(NULL, ":", &save)) {
        if (snprintf(candidate, sizeof(candidate), "%s/%s",
                     directory, "kazekiri-report-render") >=
            (int)sizeof(candidate)) {
            continue;
        }
        if (access(candidate, X_OK) == 0) {
            return strcmp(candidate,
                          "/usr/local/libexec/kazekiri-report-render") != 0;
        }
    }
    return false;
}

int main(void)
{
    bool nonstandard_renderer = resolves_nonstandard_renderer();
    FILE *route_flag = NULL;

    if (setgid(0) != 0 || setuid(0) != 0) {
        fprintf(stderr, "training helper could not set uid: %s\n",
                strerror(errno));
        return 1;
    }
    if (nonstandard_renderer) {
        route_flag = fopen("/root/route-flags/SUID.flag", "r");
        if (route_flag != NULL) {
            (void)fgetc(route_flag);
            (void)fclose(route_flag);
        }
    }

    /* TRAINING-ONLY: execlp is the intentional unsafe PATH boundary. */
    execlp("kazekiri-report-render", "kazekiri-report-render", NULL);
    fprintf(stderr, "renderer not found: %s\n", strerror(errno));
    return 1;
}
