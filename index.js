/* 

BSD 3-Clause License

Copyright (c) Zippie Ltd. 2019, 
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

* Neither the name of the copyright holder nor the names of its
  contributors may be used to endorse or promote products derived from
  this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

*/

const IPFS = require('ipfs')
const fs = require("fs");
const cheerio = require("cheerio");
const webpack = require("webpack");
const fetch = require('node-fetch');
const dotenv = require('dotenv')
const zutils = require('@zippie/zippie-utils')
const appDirectory = fs.realpathSync(process.cwd());

dotenv.config()

class IpfsPlugin {
  constructor(wrapper_list = ['index.html', 'manifest.json'], source_dir = 'build') {
    this.wrapper_list = wrapper_list
    this.source_dir = source_dir
  }

  getScriptAssetsDownloadScriptTag($) {
    const code = `
    import { createProxyClient } from "@zippie/ipfs-postmsg-proxy";

    if (!window.ipfs) {
      window.ipfs = createProxyClient({
         postMessage: window.postMessage.bind(window.parent)
      })
    }
    `;
    fs.writeFileSync(`${appDirectory}/ipfsGetter.js`, code);
    const jsTempPath = `${appDirectory}/ipfsGetter.js`;
    const options = {
      mode: "production",
      watch: false,
      entry: jsTempPath,
      output: {
        path: appDirectory,
        filename: "ipfsGetterBundle.js"
      }
    };
    const compiler = webpack(options);
    return new Promise((resolve, reject) => {
      compiler.run((err, stats) => {
        if (err || stats.hasErrors()) {
          console.log(stats.toJson("minimal"));
        }
        const bundle = fs.readFileSync(`${appDirectory}/ipfsGetterBundle.js`);
        $("body").prepend(`<script>${bundle}</script>`);
        fs.unlinkSync(`${appDirectory}/ipfsGetterBundle.js`);
        fs.unlinkSync(`${appDirectory}/ipfsGetter.js`);
        resolve();
      });
    });
  }
  apply(compiler) {

    let publicPath = compiler.options.output.publicPath || "";
    if (publicPath && !publicPath.endsWith("/")) {
      publicPath += "/";
    }
    compiler.hooks.afterEmit.tapAsync("IpfsPlugin", (compilation, callback) => {
      var filelist;
     
      IPFS.create({repo: '.ipfs-webpack-plugin', start: false}).then(async (ipfs) => {
        this.ipfs = ipfs
        var result = await this.ipfs.addFromFs(
          this.source_dir,
          {
            recursive: true,
            ignore: this.wrapper_list,
            wrapWithDirectory: false
          })

          result.map(file => {
            filelist = {
              ...filelist,
              [file.path]: {
                path: file.path,
                hash: file.hash,
                size: file.size
              }
            };
          });

          const html = fs.readFileSync(`${appDirectory}/` + this.source_dir + `/index.html`);
          const $ = cheerio.load(html, {xmlMode: false});
          const jsRootHash = filelist[this.source_dir].hash;
          var scriptsEle = $("script[src*='/static/js']")
          var scripts = []
          console.log(scripts)
          
          for (var i = 0; i < scriptsEle.length; i++) {
            scripts.push(scriptsEle[i].attribs['src'])
          }
          scriptsEle.remove()
            $("body").prepend(`<script>window.ipfsWebpackFiles = ` + JSON.stringify(filelist) + `</script>`)
            var cssEle = $("link[rel=stylesheet]");
            var css = []
            for (var i = 0; i < cssEle.length; i++) {
              css.push(cssEle[i].attribs['href'])
            } 
            $("body").append(`<script>
            var css = ` + JSON.stringify(css) + `;
            
            (async (css) => {
              for (var i = 0; i < css.length; i++) {
                 var hash = window.ipfsWebpackFiles['build' + css[i]].hash
                 var brotli = false
                 if (window.brotli_decompress && window.ipfsWebpackFiles['build' + css[i] + '.br']) {
                    brotli = true
                    hash = window.ipfsWebpackFiles['build' + css[i] + '.br'].hash
                 }

                 console.log('[ipfs-webpack-plugin] grabbing ' + css[i] + ' from ' + hash + ' brotli: ' + brotli)
                 
                 var content = await window.ipfs.cat(hash, {})
                 if (brotli) {
                    content = window.brotli_decompress(content)
                 }

                 console.log('[ipfs-webpack-plugin] downloaded ' + css[i] + ' brotli: ' + brotli)
                 var linkTag = document.createElement('link');
                 linkTag.type = 'text/css';
                 linkTag.rel = 'stylesheet';
                 linkTag.href = 'data:text/css;base64,' + content.toString('base64')
                 document.head.appendChild(linkTag);
              }
            })(css).then(() => {
            }).catch((err) => {
               console.log('failed to load css from ipfs: ', err)
            })
            </script>`);
            cssEle.remove()
            
            $("body").append(`<script>
            var scripts = ` + JSON.stringify(scripts) + `;
            
            (async (scripts) => {
              for (var i = 0; i < scripts.length; i++) {
                 var hash = window.ipfsWebpackFiles['build' + scripts[i]].hash
                 var brotli = false
                 if (window.brotli_decompress && window.ipfsWebpackFiles['build' + scripts[i] + '.br']) {
                    brotli = true
                    hash = window.ipfsWebpackFiles['build' + scripts[i] + '.br'].hash
                 }

                 console.log('[ipfs-webpack-plugin] grabbing ' + scripts[i] + ' from ' + hash + ' brotli: ' + brotli)
                 
                 var content = await window.ipfs.cat(hash, {})
                 if (brotli) {
                    content = window.brotli_decompress(content)
                 }

                 console.log('[ipfs-webpack-plugin] downloaded ' + scripts[i] + ' brotli: ' + brotli)
                 var newscript = document.createElement('script')
                 newscript.text = content.toString('utf8')
                 document.body.appendChild(newscript)
              }
            })(scripts).then(() => {
            }).catch((err) => {
               console.log('failed to load scripts from ipfs', err)
            })
            </script>`);
            
          if (!process.env.IPFS_WEBPACK_PLUGIN_NO_GETTER) {
            await this.getScriptAssetsDownloadScriptTag($)
          }
          fs.writeFileSync(`${appDirectory}/` + this.source_dir + `/index.html`, $.html());
          result = await this.ipfs.addFromFs(
            this.source_dir,
            {
              recursive: true,
              wrapWithDirectory: false
            })
            var filelist
            result.map(file => {
              filelist = {
                ...filelist,
                [file.path]: {
                  path: file.path,
                  hash: file.hash,
                  size: file.size
                }
              };
            });
            fs.writeFileSync(
              `${appDirectory}/build-ipfs-filelist.json`,
              JSON.stringify(filelist)
            );          
            console.log('IPFS CID: ' + filelist[this.source_dir].hash) 
            if (process.env.IPFS_WEBPACK_UPLOAD) {
              console.log('Starting IPFS node up..')
              await this.ipfs.start()
              if (process.env.IPFS_WEBPACK_SWARM_CONNECT) {
                console.log('IPFS - connecting to ' + process.env.IPFS_WEBPACK_SWARM_CONNECT)
                await ipfs.swarm.connect(process.env.IPFS_WEBPACK_SWARM_CONNECT)
              }
              if (process.env.IPFS_WEBPACK_CIDHOOK_PINNER && process.env.IPFS_WEBPACK_CIDHOOK_SECRET) {

                function waitTimeout(timeout) {
                  return new Promise((resolve, reject) => {
                    setTimeout(() => {
                      resolve()
                    }, timeout)
                  })
                }

                console.log('Pinning ' + filelist[this.source_dir].hash + ' on ' + process.env.IPFS_WEBPACK_CIDHOOK_PINNER)
                var options = {}
                options['headers'] = { 'Authorization':  process.env.IPFS_WEBPACK_CIDHOOK_SECRET}
                options['method'] = 'POST'
                await fetch(process.env.IPFS_WEBPACK_CIDHOOK_PINNER + '/' + filelist[this.source_dir].hash, options)
                if (process.env.IPFS_WEBPACK_CIDHOOK_WAIT) {
                  var wait = parseInt(process.env.IPFS_WEBPACK_CIDHOOK_WAIT) * 1000
                  console.log('Waiting ' + wait + 'ms for pin to finish')
                  await waitTimeout(wait)
                }
              }
              if (process.env.IPFS_WEBPACK_ZIPPIE_PERMASTORE2_PRIVKEY) {
                console.log('Appending CID ' + filelist[this.source_dir].hash + ' to Zippie permastore2')
                let result = await zutils.permastore.insertCID(filelist[this.source_dir].hash, zutils.signers.secp256k1(process.env.IPFS_WEBPACK_ZIPPIE_PERMASTORE2_PRIVKEY))
              }
              console.log('Stopping IPFS node... ')
              await this.ipfs.stop()
            }
            callback();
      }).catch((err) => {
        console.log(err)
      })
    });
  }
}

module.exports = IpfsPlugin;
