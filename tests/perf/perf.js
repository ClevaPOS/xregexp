(function() {
    var outputBox = document.getElementById('log');
    var suites = [];

    // Used to skip 21-bit Unicode tests when running older XRegExp versions
    var hasAstralSupport = parseInt(XRegExp.version, 10) >= 3;
    // The `cache.flush` method was added in v3
    XRegExp.cache.flush = XRegExp.cache.flush || function() {};
    // The `install` and `uninstall` methods were added in v2
    XRegExp.install = XRegExp.install || function() {};
    XRegExp.uninstall = XRegExp.uninstall || function() {};
    // The `exec` method was renamed from `execAt` in v2
    XRegExp.exec = XRegExp.exec || XRegExp.execAt;

    function log(msg) {
        outputBox.insertAdjacentHTML('beforeend', msg.replace(/\n/g, '<br>'));
    }
    function scrollToEnd() {
        window.scroll(0, document.body.scrollHeight);
    }

    Benchmark.options.async = true;
    Benchmark.Suite.options.onStart = function() {
        log('\n' + this.name + ':');
    };
    Benchmark.Suite.options.onCycle = function(event) {
        log('\n' + String(event.target));
        scrollToEnd();
    };
    Benchmark.Suite.options.onComplete = function() {
        log('\nFastest is ' + this.filter('fastest').pluck('name') + '\n');
        // Remove current suite from queue
        suites.shift();
        if (suites.length) {
            // Run next suite
            suites[0].run();
        } else {
            log('\nFinished. &#x263A;');
        }
        scrollToEnd();
    };

    // Expose as global
    window.run = function() {
        log('Testing XRegExp ' + XRegExp.version + '.\n');
        log('Sit back and relax. This might take a while.\n');
        suites[0].run();
    };

/*--------------------------------------
 *  Start of perf suites
 *------------------------------------*/

    (function() {
        var configs = [
            {
                name: 'Constructor with short pattern',
                pattern: '^([.])\\1+$'
            },
            {
                name: 'Constructor with medium pattern',
                pattern: '^([.])\\1+$ this is a test of a somewhat longer pattern'
            },
            {
                name: 'Constructor with long pattern',
                pattern: XRegExp('\\p{L}').source
            },
            {
                name: 'Constructor with x flag, whitespace, and comments',
                pattern: '\n                       # comment\n                       # comment\n',
                flags: 'x'
            }
        ];

        configs.forEach(function(config) {
            var flags = config.flags || '';
            var allFlagsNative = /^[gimuy]*$/.test(flags);

            var suite = Benchmark.Suite(config.name)
                .add('XRegExp with pattern cache flush', function() {
                    XRegExp(config.pattern, flags);
                    XRegExp.cache.flush('patterns');
                })
                .add('XRegExp', function() {
                    XRegExp(config.pattern, flags);
                })
                .add('XRegExp.cache', function() {
                    XRegExp.cache(config.pattern, flags);
                });
            if (allFlagsNative) {
                suite.add('RegExp', function() {
                    new RegExp(config.pattern, flags);
                });
            }

            suites.push(suite);
        });
    }());

    (function() {
        var regexG = /(((?=x).)\2)+/g;
        var str = Array(30 + 1).join('hello world x ') + 'xx!';
        var pos = 5;

        XRegExp.install('natives');
        var fixedExec = RegExp.prototype.exec;
        XRegExp.uninstall('natives');

        suites.push(Benchmark.Suite('exec')
            .add('Native exec', function() {
                regexG.lastIndex = pos;
                regexG.exec(str);
            })
            .add('Shimmed exec', function() {
                regexG.lastIndex = pos;
                fixedExec.call(regexG, str);
            })
            .add('XRegExp.exec', function() {
                XRegExp.exec(str, regexG, pos);
            })
        );

        var numStrs = 2e5;
        var strs = [];
        var i;

        // Use lots of different strings to remove the benefit of Opera's regex/string match cache
        for (i = 0; i < numStrs; ++i) {
            strs.push(str + i);
        }

        suites.push(Benchmark.Suite('exec with ' + numStrs + ' different strings')
            .add('Native exec', function() {
                regexG.lastIndex = pos;
                regexG.exec(strs[++i] || strs[i=0]);
            })
            .add('Shimmed exec', function() {
                regexG.lastIndex = pos;
                fixedExec.call(regexG, strs[++i] || strs[i=0]);
            })
            .add('XRegExp.exec', function() {
                XRegExp.exec(strs[++i] || strs[i=0], regexG, pos);
            })
        );

        suites.push(Benchmark.Suite('Sticky exec with ' + numStrs + ' different strings')
            .add('Native exec', function() {
                regexG.lastIndex = pos;
                var match = regexG.exec(strs[++i] || strs[i=0]);
                if (match && match.index !== pos) {
                    match = null;
                }
            })
            .add('Shimmed exec', function() {
                regexG.lastIndex = pos;
                var match = fixedExec.call(regexG, strs[++i] || strs[i=0]);
                if (match && match.index !== pos) {
                    match = null;
                }
            })
            .add('XRegExp.exec', function() {
                var match = XRegExp.exec(strs[++i] || strs[i=0], regexG, pos, 'sticky');
            })
        );
    }());

    (function() {
        var str = Array(30 + 1).join('hello xx world ');

        suites.push(Benchmark.Suite('Iteration with a nonglobal regex')
            .add('replace with callback', function() {
                var r = /^|(((?=x).)\2)+/;
                var matches = [];
                if (!r.global) {
                    // globalize
                    r = new RegExp(
                        r.source,
                        'g' +
                            (r.ignoreCase ? 'i' : '') +
                            (r.multiline ? 'm' : '') +
                            (r.unicode ? 'u' : '') +
                            (r.sticky ? 'y' : '')
                    );
                }
                str.replace(r, function(match) {
                    matches.push(match);
                });
            })
            .add('while/exec', function() {
                var r = /^|(((?=x).)\2)+/;
                var matches = [];
                var match;
                if (r.global) {
                    r.lastIndex = 0;
                } else {
                    // globalize
                    r = new RegExp(
                        r.source,
                        'g' +
                            (r.ignoreCase ? 'i' : '') +
                            (r.multiline ? 'm' : '') +
                            (r.unicode ? 'u' : '') +
                            (r.sticky ? 'y' : '')
                    );
                }
                while (match = r.exec(str)) {
                    matches.push(match[0]);
                    if (r.lastIndex === match.index) {
                        ++r.lastIndex;
                    }
                }
            })
            .add('while/XRegExp.exec', function() {
                var r = /^|(((?=x).)\2)+/;
                var matches = [];
                var match;
                var pos = 0;
                while (match = XRegExp.exec(str, r, pos)) {
                    matches.push(match[0]);
                    pos = match.index + (match[0].length || 1);
                }
            })
            .add('XRegExp.forEach', function() {
                var r = /^|(((?=x).)\2)+/;
                var matches = [];
                XRegExp.forEach(str, r, function(match) {
                    matches.push(match[0]);
                });
            })
        );
    }());

    (function() {
        var str = Array(30 + 1).join('hello world ') + 'http://xregexp.com/path/to/file?q=1';
        var pattern = '\\b([^:/?\\s]+)://([^/?\\s]+)([^?\\s]*)\\??([^\\s]*)';
        var regexp = new RegExp(pattern);
        var xregexp = XRegExp(pattern);

        suites.push(Benchmark.Suite('Regex object type')
            .add('RegExp object', function() {
                regexp.exec(str);
            })
            .add('XRegExp object', function() {
                xregexp.exec(str);
            })
        );

        var xregexpNamed4 =
            XRegExp('\\b(?<scheme> [^:/?\\s]+ ) ://   # aka protocol   \n' +
                    '   (?<host>   [^/?\\s]+  )       # domain name/IP \n' +
                    '   (?<path>   [^?\\s]*   ) \\??  # optional path  \n' +
                    '   (?<query>  [^\\s]*    )       # optional query', 'x');
        var xregexpNamed1 =
            XRegExp('\\b(?<scheme> [^:/?\\s]+ ) ://   # aka protocol   \n' +
                    '   (          [^/?\\s]+  )       # domain name/IP \n' +
                    '   (          [^?\\s]*   ) \\??  # optional path  \n' +
                    '   (          [^\\s]*    )       # optional query', 'x');
        var xregexpNumbered =
            XRegExp('\\b(          [^:/?\\s]+ ) ://   # aka protocol   \n' +
                    '   (          [^/?\\s]+  )       # domain name/IP \n' +
                    '   (          [^?\\s]*   ) \\??  # optional path  \n' +
                    '   (          [^\\s]*    )       # optional query', 'x');

        suites.push(Benchmark.Suite('Capturing')
            .add('Numbered capture', function() {
                XRegExp.exec(str, xregexpNumbered);
            })
            .add('Named capture (one name)', function() {
                XRegExp.exec(str, xregexpNamed1);
            })
            .add('Named capture (four names)', function() {
                XRegExp.exec(str, xregexpNamed4);
            })
        );
    }());

    suites.push(Benchmark.Suite('Unicode letter construction')
        .add('Incomplete set: /[a-z]/i', function() {
            XRegExp('(?i)[a-z]');
            XRegExp.cache.flush('patterns');
        })
        .add('BMP only: /\\p{L}/', function() {
            XRegExp('\\p{L}');
            XRegExp.cache.flush('patterns');
        })
        .add('Full Unicode: /\\p{L}/A', hasAstralSupport ?
            function() {
                XRegExp('(?A)\\p{L}');
                XRegExp.cache.flush('patterns');
            } :
            function() {
                throw new Error('Astral mode unsupported');
            }
        )
    );

    (function() {
        var asciiText = 'Now is the time for all good men to come to the aid of the party!';
        var mixedText = 'We are looking for a letter/word followed by an exclamation mark, ☃ ☃ ☃ ☃ ☃ and δοκεῖ δέ μοι καὶ Καρχηδόνα μὴ εἶναι!';
        var unicodeText = 'Зоммерфельд получил ряд важных результатов в рамках «старой квантовой теории», предшествовавшей появлению современной квантовой механики!';
        var unicodeText2 = 'როგორც სამედიცინო ფაკულტეტის ახალგაზრდა სტუდენტი, გევარა მთელს ლათინურ ამერიკაში მოგზაურობდა და იგი სწრაფად!';

        function test(regex) {
            regex.test(asciiText);
            regex.test(mixedText);
            regex.test(unicodeText);
            regex.test(unicodeText2);
        }

        var azCaselessChar = XRegExp('(?i)[a-z]!');
        var bmpLetterChar = XRegExp('\\p{L}!');
        var astralLetterChar = hasAstralSupport ? XRegExp('(?A)\\p{L}!') : null;

        suites.push(Benchmark.Suite('Unicode letter matching')
            .add('a-z caseless', function() {
                test(azCaselessChar);
            })
            .add('\\p{L}', function() {
                test(bmpLetterChar);
            })
            .add('\\p{L} astral', hasAstralSupport ?
                function() {
                    test(astralLetterChar);
                } :
                function() {
                    throw new Error('Astral mode unsupported');
                }
            )
        );

        var azCaselessWord = XRegExp('(?i)[a-z]+!');
        var bmpLetterWord = XRegExp('\\p{L}+!');
        var astralLetterWord = hasAstralSupport ? XRegExp('(?A)\\p{L}+!') : null;

        suites.push(Benchmark.Suite('Unicode word matching')
            .add('a-z caseless', function() {
                test(azCaselessWord);
            })
            .add('\\p{L}', function() {
                test(bmpLetterWord);
            })
            .add('\\p{L} astral', hasAstralSupport ?
                function() {
                    test(astralLetterWord);
                } :
                function() {
                    throw new Error('Astral mode unsupported');
                }
            )
        );
    }());
}());
