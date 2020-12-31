const YouTube = require('discord-youtube-api')
const LastFM = require('last-fm')
const YoutubeMp3Downloader = require("youtube-mp3-downloader");
const fs = require('fs')
const fetch = require('node-fetch')
const download = require('image-downloader')
const mp3tag = require('node-id3')
const oneline = require('one-line-print')
const readline = require('readline')

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
})

let opt

try {
    opt = JSON.parse(fs.readFileSync('./options.json', 'utf8'));
} catch (error) {
    console.log("I can't detect options.json!")
    process.exit(0)
}

var dirRes = './audio';
if (!fs.existsSync(dirRes)){
    fs.mkdirSync(dirRes);
}

var dirImg = './images';
if (!fs.existsSync(dirImg)){
    fs.mkdirSync(dirImg);
}

var YD = new YoutubeMp3Downloader({
    "ffmpegPath": "./node_modules/ffmpeg-static/ffmpeg.exe",
    "outputPath": "./audio",
});

function makeid(length) {
    var result = '';
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for ( var i = 0; i < length; i++ ) {
       result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

function cleanStr(string) {
    return string.replace('\\', '').replace('/', '').replace('*', '').replace('"', '').replace('?', '').replace('<', '').replace('>', '').replace('|', '').replace(':', '')
}

const lastfm = new LastFM(opt.lastFmKey)
const search = new YouTube(opt.youtubeKey)

rl.question("\nEnter YouTube search query: ", async function(keyword) {

    const videosearched = await search.searchVideos(keyword)

    console.log("\nDownloading: " + videosearched.url)

    const audioID = makeid(5)

    YD.download(videosearched.id, `audio-${audioID}.mp3`);
    
    YD.on("progress", function(progress) {
        oneline.line(`${Math.round(progress.progress.percentage)}% downloaded`);
    });

    YD.on("finished", async function(err, data) {
        
        oneline.line("Track download finished\n\n")
        
        rl.question("Enter track info ( <artist> || <track> || <album> ): ", async function(info) {

            console.log("")
            const infoArr = info.split(" || ")

            lastfm.trackInfo({ name: infoArr[1], artistName: infoArr[0], limit: 1}, async (err, data) => {

                if (err) {
                    console.log(err)
                    console.log("Error occurred while searching track info, operation stopped\n")
                    process.exit(0)
                }

                lastfm.albumInfo({ name: infoArr[2], artistName: data.artistName }, async (err, dataAlbum) => {

                    if (err) {
                        console.log(err)
                        console.log("Error occurred while searching album info, operation stopped\n")
                        process.exit(0)
                    }

                    const trackAlbum = dataAlbum.name
                    const trackArtist = data.artistName
                    const trackTitle = data.name

                    console.log("Title: " + trackTitle)
                    console.log("Artist: " + trackArtist)
                    console.log("Album: " + trackAlbum)
        
                    let albumData = await fetch(`https://itunes.apple.com/search?term=${trackArtist}+${trackAlbum}+${trackTitle}&limit=1&entity=song`)
                    let res = await albumData.json()
                    if (res.resultCount == 0) {
                        console.log("Couldn't find album cover, operation stopped\n")
                        process.exit(0)
                    }

                    let lyricsRes = await fetch(`https://some-random-api.ml/lyrics/?title=${encodeURI(trackArtist)}_${encodeURI(trackTitle)}`)
                    lyricsRes = await lyricsRes.json()
                    if (!lyricsRes.lyrics) {
                        console.log("Couldn't find lyrics, operation stopped\n")
                        process.exit(0)
                    }

                    const trackArt = res.results[0].artworkUrl100.replace(/100x100/, '600x600')
                    const trackYear = res.results[0].releaseDate.split("-")[0]
                    const trackGenre = res.results[0].primaryGenreName
                    const trackNumber = res.results[0].trackNumber
                    const trackLyrics = lyricsRes.lyrics
                    
                    console.log("Year: " + trackYear)
                    console.log("Album art: " + trackArt)
                    console.log("Track number: " + trackNumber)
                    console.log("Genre: " + trackGenre)
                    console.log("")

                    const options = {
                        url: trackArt,
                        dest: `./images/image-${makeid(5)}.jpg`
                    }
                        
                    download.image(options)
                    .then(async ({ filename }) => {
                        console.log('Album artwork saved:', filename)

                        const tags = {
                            title: trackTitle,
                            artist: trackArtist,
                            album: trackAlbum,
                            TRCK: trackNumber,
                            TYER: trackYear,
                            TCON: trackGenre,
                            APIC: filename,
                            USLT: {
                                language: "eng",
                                text: trackLyrics
                            }
                        }

                        mp3tag.update(tags, `./audio/audio-${audioID}.mp3`)

                        fs.rename(`./audio/audio-${audioID}.mp3`, `./audio/${cleanStr(trackArtist)} - ${trackTitle}.mp3`, function(err) {
                            if (err) {
                                console.log(err)
                                console.log("Error occurred while renaming file, operation stopped\n")
                                process.exit(0)
                            }
                            console.log(`\nYour mp3 file is saved as ${cleanStr(trackArtist)} - ${trackTitle}.mp3 in audio folder.\nPress ctrl+c to exit.\n`)
                        })
                    })           
                })
            })
        })
    })
})