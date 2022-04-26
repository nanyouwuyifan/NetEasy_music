import request from "../../utils/request";
import PubSub from "pubsub-js";
import moment from 'moment';

// 获取全局实例
const appInstance = getApp();
Page({

    /**
     * 页面的初始数据
     */
     data: {
        isPlay: false,//标识播放状态
        song: {},//歌曲详情对象
        musicId: '',//歌曲Id
        currentTime: '00:00',//当前时长
        durationTime:'00:00',//总时长
        currentWidth: 0,//实时进度条宽度
        lyric: [],//歌词
        lyricTime: 0,//歌词对应的时间
        currentLyric: "",//当前歌词对象
      },

    /**
     * 生命周期函数--监听页面加载
     */
    onLoad: function (options) {
        let musicId = options.musicId;
        this.getMusicInfo(musicId)
        this.setData({
            musicId,
            
        })
        this.getMusicInfo(musicId);
        this.getLyric(musicId);

        /*
   * 问题： 如果用户操作系统的控制音乐播放/暂停的按钮，页面不知道，导致页面显示是否播放的状态和真实的音乐播放状态不一致
   * 解决方案：
   *   1. 通过控制音频的实例 backgroundAudioManager 去监视音乐播放/暂停
   *
   * */


        // 判断当前页面音乐是否在播放
        if(appInstance.globalData.isMusicPlay && appInstance.globalData.musicId === musicId){
            // 修改当前页面音乐播放状态为true
            this.setData({
                isPlay: true
            })
        }

        // 创建控制音乐播放的实例
        this.backgroundAudioManager = wx.getBackgroundAudioManager();
        // 监视音乐播放/暂停/停止
        this.backgroundAudioManager.onPlay(() => {
            this.changePlayState(true);
            // 修改全局音乐播放的状态
            appInstance.globalData.musicId = musicId;
        });
        this.backgroundAudioManager.onPause(() => {
            this.changePlayState(false);
        });
        this.backgroundAudioManager.onStop(() => {
            this.changePlayState(false);
        })
          //音乐播放自然结束
    this.backgroundAudioManager.onEnded(()=>{
        //切歌
        PubSub.publish('switchMusic','next');
        this.setData({
          currentWidth: 0,
          currentTime: '00:00',
          lyric: [],
          lyricTime: 0,
        })
      })
        // 监听音乐实时播放的进度
        this.backgroundAudioManager.onTimeUpdate(() => {
            // console.log('总时长: ', this.backgroundAudioManager.duration);
            // console.log('实时的时长: ', this.backgroundAudioManager.currentTime);
            // 格式化实时的播放时间
            let lyricTime = Math.ceil(this.backgroundAudioManager.currentTime); 
            let currentTime = moment(this.backgroundAudioManager.currentTime * 1000).format('mm:ss')
            let currentWidth = this.backgroundAudioManager.currentTime/this.backgroundAudioManager.duration * 450;
            this.setData({
                lyricTime,
                currentTime,
                currentWidth
            })
            this.getCurrentLyric();

        })

    },
    // 修改播放状态的功能函数
    changePlayState(isPlay){
        // 修改音乐是否的状态
        this.setData({
            isPlay
        })

        // 修改全局音乐播放的状态
        // appInstance.globalData.isMusicPlay = isPlay;/
    },
    //获取音乐详情的功能函数
    async getMusicInfo(musicId){
        let songData = await request('/song/detail', {ids: musicId});
        // songData.songs[0].dt 单位ms
        let durationTime = moment(songData.songs[0].dt).format('mm:ss');
        this.setData({
            song: songData.songs[0],
            durationTime
        })

        // 动态修改窗口标题
        wx.setNavigationBarTitle({
            title: this.data.song.name
        })
    },


    // 点击播放/暂停的回调
    handleMusicPlay(){
        let isPlay = !this.data.isPlay;
        // 修改是否播放的状态
        this.setData({
          isPlay
        })

        let {musicId, musicLink} = this.data;
        this.musicControl(isPlay, musicId, musicLink);
    },


    // 控制音乐播放/暂停的功能函数
    async musicControl(isPlay, musicId, musicLink){
        this.backgroundAudioManager = wx.getBackgroundAudioManager();
        if(isPlay){ // 音乐播放
            if(!musicLink){
                // 获取音乐播放链接
                let musicLinkData = await request('/song/url', {id: musicId});
                musicLink = musicLinkData.data[0].url;

                this.setData({
                    musicLink
                })
            }

            this.backgroundAudioManager.src = musicLink;
            this.backgroundAudioManager.title = this.data.song.name;
        }else { // 暂停音乐
            this.backgroundAudioManager.pause();
        }

    },


    /// 点击切歌的回调
    handleSwitch(event){
        // 获取切歌的类型
        let type = event.currentTarget.id;

        // 关闭当前播放的音乐
        this.backgroundAudioManager.stop();
        // // 订阅来自recommendSong页面发布的musicId消息
        PubSub.subscribe('musicId', (msg, musicId) => {
            // console.log(musicId);

            // 获取音乐详情信息
            this.getMusicInfo(musicId);
            // 自动播放当前的音乐
            this.musicControl(true, musicId);
            // 取消订阅
            PubSub.unsubscribe('musicId');
        })
        // 发布消息数据给recommendSong页面
        PubSub.publish('switchType', type)
    },
    //获取歌词
  async getLyric(musicId){
    let lyricData = await request("/lyric", {id: musicId});
    let lyric = this.formatLyric(lyricData.lrc.lyric);
  },

  //传入初始歌词文本text
  formatLyric(text) {
    let result = [];
    let arr = text.split("\n"); //原歌词文本已经换好行了方便很多，我们直接通过换行符“\n”进行切割
    let row = arr.length; //获取歌词行数
    for (let i = 0; i < row; i++) {
      let temp_row = arr[i]; //现在每一行格式大概就是这样"[00:04.302][02:10.00]hello world";
      let temp_arr = temp_row.split("]");//我们可以通过“]”对时间和文本进行分离
      let text = temp_arr.pop(); //把歌词文本从数组中剔除出来，获取到歌词文本了！
      //再对剩下的歌词时间进行处理
      temp_arr.forEach(element => {
        let obj = {};
        let time_arr = element.substr(1, element.length - 1).split(":");//先把多余的“[”去掉，再分离出分、秒
        let s = parseInt(time_arr[0]) * 60 + Math.ceil(time_arr[1]); //把时间转换成与currentTime相同的类型，方便待会实现滚动效果
        obj.time = s;
        obj.text = text;
        result.push(obj); //每一行歌词对象存到组件的lyric歌词属性里
      });
    }
    result.sort(this.sortRule) //由于不同时间的相同歌词我们给排到一起了，所以这里要以时间顺序重新排列一下
    this.setData({
      lyric: result
    })
  },
  sortRule(a, b) { //设置一下排序规则
    return a.time - b.time;
  },

  //控制歌词播放
  getCurrentLyric(){
    let j;
    for(j=0; j<this.data.lyric.length-1; j++){
      if(this.data.lyricTime == this.data.lyric[j].time){
        this.setData({
          currentLyric : this.data.lyric[j].text
        })
      }
    }
  },

    /**
     * 生命周期函数--监听页面初次渲染完成
     */
    onReady: function () {

    },

    /**
     * 生命周期函数--监听页面显示
     */
    onShow: function () {

    },

    /**
     * 生命周期函数--监听页面隐藏
     */
    onHide: function () {

    },

    /**
     * 生命周期函数--监听页面卸载
     */
    onUnload: function () {

    },

    /**
     * 页面相关事件处理函数--监听用户下拉动作
     */
    onPullDownRefresh: function () {

    },

    /**
     * 页面上拉触底事件的处理函数
     */
    onReachBottom: function () {

    },

    /**
     * 用户点击右上角分享
     */
    onShareAppMessage: function () {

    }
})