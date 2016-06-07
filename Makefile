tests:
	cd tests && ./dotests

.PHONY: tests

.PHONY: build

.PHONY: publish

build:
	grunt build
	git add client/yate.js
	git commit -m "Rebuild client Yate"

publish:
	git push origin gh-pages

