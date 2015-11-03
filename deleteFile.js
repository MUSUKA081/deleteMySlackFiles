/* Slack API Token */
var token = '**************';

var request = require('request');
var fs = require('fs');
var Promise = require('bluebird');

Promise.promisifyAll(request);

/* バックアップ用のディレクトリを作成 */
makeBackupDir()
.then(function(){
    /* 自分のユーザidを取得 */
    return request.postAsync({url: 'https://slack.com/api/auth.test', formData: {token: token}});
})
.spread(function(resp, body){
    var result = JSON.parse(body);
    var my_id = result.user_id;

    /* 自分がアップロードしたファイルの一覧を取得 */
    return request.postAsync({url:'https://slack.com/api/files.list', formData: {
        token: token,
        count: 1000, // 1000個のファイル (上限不明)
        user: my_id,
        page: 1
    }});
})
.spread(function(res, body){
    /* ファイルリストを保存 */
    fs.writeFile('./files.json', JSON.stringify(JSON.parse(body), null, 4), function(err){
        if(err){console.log(err);}
    });

    var file_list = JSON.parse(body).files;

    console.log('start: delete', file_list.length, 'files');

    /* ファイルバックアップ */
    return Promise.reduce(file_list, moveFileToLocal, 0)
    .then(function(delete_count){
        console.log('finish: delete', delete_count, 'files');
    });
})
.catch(function(err){
    console.error(err);
});

/* バックアップ用のディレクトリを作成 */
function makeBackupDir(){
    return new Promise(function(resolve, reject){
        fs.mkdir('./backup', 0o755, function(err){
            if(err && err.code !== 'EEXIST'){
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

/* ファイルをダウンロードして削除 */
function moveFileToLocal(count, file){
    return new Promise(function(resolve){
        if(file.url_download){
            downloadFileAsync(file)
            .then(function(){
                console.log('download complete:', file.id, file.name);
                resolve(deleteFileAsync(count, file));
            }, function(err){
                console.log('download error:', file.id, file.name);
                console.error(err);
                resolve(count);
            });
        } else {
            console.log('no download link:', file.id, file.name);
            resolve(deleteFileAsync(count, file));
        }
    });
}


/* ファイルのダウンロード */
function downloadFileAsync(file){
    return new Promise(function(resolve, reject){
        request.get({url: file.url_download})
        .pipe(
            fs.createWriteStream('./backup/' + file.id + '-' + file.name)
            .on('finish', function(){
                resolve();
            })
            .on('err', function(err){
                reject(err);
            })
        );
    });
}

/* 一つのファイルを削除 */
function deleteFileAsync(count, file){
    // return Promise.resolve(count+1);
    return request.postAsync({url: 'https://slack.com/api/files.delete', formData: {token: token, file: file.id}})
    .then(function(){
        console.log('delete complete:', file.id, file.name);
        return Promise.resolve(count + 1);
    })
    .catch(function(err){
        console.log('delete error:', file.id, file.name);
        console.error(err);
        return Promise.resolve(count);
    });
}