var FtpDeploy = require("ftp-deploy"),
    ftpDeploy = new FtpDeploy(),
    lpath = process.argv[2],
    rpath = process.argv[3],

    config = {
        user: "c0500",
        password: "\n",
        agent: "pageant",
        host: "c0500.paas1.tx.modxcloud.com",
        port: 22,
        localRoot: __dirname + lpath,
        remoteRoot: rpath,
        include: ["*"],
        deleteRemote: false,
        forcePasv: true,
        sftp: true,
        //debug: function (data){console.log(data);}
    };

if(!rpath || !lpath){
    console.log("No path.");
    return;
}

ftpDeploy
    .deploy(config)
    .then(res => console.log("finished:", res))
    .catch(err => console.log(err));