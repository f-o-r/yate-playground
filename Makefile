tests:
	cd tests && ./dotests

.PHONY: tests

.PHONY: build

build:
	grunt build
	git add client/yate.js
	git commit -m "Rebuild client Yate"
