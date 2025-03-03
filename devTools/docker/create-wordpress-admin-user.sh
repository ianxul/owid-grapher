#!/usr/bin/env  bash
set -o errexit
set -o pipefail
set -o nounset

: "${WORDPRESS_DB_NAME:?Need to set WORDPRESS_DB_NAME non-empty}"
: "${WORDPRESS_DB_USER:?Need to set WORDPRESS_DB_USER non-empty}"
: "${WORDPRESS_DB_PASS:?Need to set WORDPRESS_DB_PASS non-empty}"
: "${DB_ROOT_HOST:?Need to set DB_HDB_ROOT_HOSTOST non-empty}"

_mysql() {
    mysql --default-character-set=utf8mb4 -u$WORDPRESS_DB_USER -p$WORDPRESS_DB_PASS -h $DB_ROOT_HOST -e "$1" $WORDPRESS_DB_NAME
}

createWordpressAdminUser() {
    echo "Clearing wordpress password hashes"
    _mysql 'UPDATE wp_users SET user_pass = "";'

    # make an admin@example.com user with password "admin"
    echo "Adding the user admin@example.com with password 'admin'"
    _mysql 'INSERT INTO wp_users (user_login, user_email, user_pass, user_registered, user_nicename) VALUES ("admin", "admin@example.com", "$2y$10$2ilzpLslIA29cZezVXJTDOqLlkGyXK6YcNvr2QPvn95WdmVdnxl2S", NOW(), "Admin");'

    # give the user editor permissions
    echo "Giving the admin user edit privileges"
    _mysql 'INSERT INTO wp_usermeta (user_id, meta_key, meta_value) VALUES ((SELECT id FROM wp_users WHERE user_email = "admin@example.com"), "wp_capabilities", "a:1:{s:6:\"editor\";b:1;}");'

    return 0
}

createWordpressAdminUser
