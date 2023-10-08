# Nebula Initiate Query

CREATE SPACE IF NOT EXISTS btc_main(vid_type = FIXED_STRING(73));
USE btc_main;
CREATE TAG IF NOT EXISTS transaction(create_time int NOT NULL );
CREATE TAG IF NOT EXISTS output(n int not null, type int);
CREATE EDGE IF NOT EXISTS inp(n int not null, type int);
CREATE EDGE IF NOT EXISTS out(n int not null, type int);

# Core

Crawl the network and create relation between transaction inputs and outputs.

# Api

Simple endpoint to get relation between two addresses.
