WQX=(function(){
  var wqx=function(){
    this.regpc=0;
    this.rega=0;
    this.regx=0;
    this.regy=0;
    this.regs=0;
    this.flagc=0;
    this.flagz=0;
    this.flagi=0;
    this.flagd=0;
    this.flagb=0;
    this.flagv=0;
    this.flagn=0;
    this.ram=new Uint8Array(0x8000); // 32KB RAM
    this.page0=this.pref(this.ram,0,0x2000);
    this.page1=this.pref(this.ram,0x2000,0x2000);
    this.page2=this.pref(this.ram,0x4000,0x2000);
    this.page6=this.pref(this.ram,0x6000,0x2000);
    this.stack=this.pref(this.ram,0x100,0x100);
    this.pio=this.pref(this.ram,0,0x40);
    this.p40=this.pref(this.ram,0x40,0x40);
    this.bak40=new Uint8Array(0x40);
    this.plcd=null;
    this.rom=new Uint8Array(0x8000*0x300); // 24MB ROM
    this.nor=new Uint8Array(0x8000*0x20); // 1MB FLASH
    this.romVol0=new Array(0x100);
    this.romVol1=new Array(0x100);
    this.romVol2=new Array(0x100);
    for(var i=0;i<0x100;i++){
      this.romVol0[i]=this.pref(this.rom,0x8000*i,0x8000);
      this.romVol1[i]=this.pref(this.rom,0x8000*(0x100+i),0x8000);
      this.romVol2[i]=this.pref(this.rom,0x8000*(0x200+i),0x8000);
    }
    this.norBanks=new Array(0x20);
    for(var j=0;j<0x20;j++){
      this.norBanks[j]=this.pref(this.nor,0x8000*j,0x8000);
    }
    this.bbsPages=new Array(0x10);
    this.memMap=new Array(8);
    this.keyGrid=new Uint8Array(8);
    this.clockBuff=new Uint8Array(80);
    this.clockFlag=0;
    this.wavBuff=new Uint8Array(0x20);
    this.wavFlag=0;
    this.wavIdx=0;
    this.wavPlaying=0;
    this.shouldWakeUp=false;
    this.wakeUpPending=false;
    this.wakeUpVal=0;
    this.slept=false;
    // flash programming
    this.flsStep=0;
    this.flsType=0;
    this.flsBank=0;
    this.flsBak1=0;
    this.flsBak2=0;
    this.flsBuff=new Uint8Array(0x100);
    // cpu cycles
    this.frameDelay=this.BASE_FRAME_DELAY;
    this.cycFrames=this.BASE_CYC_FRAMES;
    this.cyc=0;
    this.nextTimer0Cyc=0;
    this.nextTimer1Cyc=0;
    this.timer0Cnt=0;
    this.frameTimer=0;
    this.lcdCtx=null;
    this.lcdBuff=new Uint8Array(1600);
    this.lcdImgTbl=new Array(33);
    // this._lcd_last_write_addr=0;
  };
  wqx.prototype.RESET_ADDR=0xFFFC;
  wqx.prototype.IRQ_ADDR=0xFFFE;
  // wqx.prototype.NMI_ADDR=0xFFFA;
  wqx.prototype.CPU_FREQ=5120000;
  wqx.prototype.BASE_FPS=25;
  wqx.prototype.BASE_FRAME_DELAY=1000/wqx.prototype.BASE_FPS;
  wqx.prototype.BASE_CYC_FRAMES=wqx.prototype.CPU_FREQ/wqx.prototype.BASE_FPS;
  wqx.prototype.CYC_TIMER0=wqx.prototype.CPU_FREQ/2;
  wqx.prototype.CYC_TIMER1=wqx.prototype.CPU_FREQ/256;
  wqx.prototype.FLS_TYPE_MAP=new Uint8Array(0x100);
  wqx.prototype.FLS_TYPE_MAP[0x90]=1;
  wqx.prototype.FLS_TYPE_MAP[0xA0]=2;
  wqx.prototype.FLS_TYPE_MAP[0x80]=3;
  wqx.prototype.FLS_TYPE_MAP[0xA8]=4;
  wqx.prototype.FLS_TYPE_MAP[0x88]=5;
  wqx.prototype.FLS_TYPE_MAP[0x78]=6;
  wqx.prototype.WAKE_UP_MAP=new Uint8Array(0x10);
  wqx.prototype.WAKE_UP_MAP[0x08]=0x00;
  wqx.prototype.WAKE_UP_MAP[0x09]=0x0A;
  wqx.prototype.WAKE_UP_MAP[0x0A]=0x08;
  wqx.prototype.WAKE_UP_MAP[0x0B]=0x06;
  wqx.prototype.WAKE_UP_MAP[0x0C]=0x04;
  wqx.prototype.WAKE_UP_MAP[0x0D]=0x02;
  wqx.prototype.WAKE_UP_MAP[0x0E]=0x0C;
  wqx.prototype.WAKE_UP_MAP[0x0F]=0x00;
  // 6502 CPU instructions
  wqx.prototype.CPU_INS=[
    function i00(o){
      o.regpc=(o.regpc+1)&0xFFFF;
      o.push(o.regpc>>>8);
      o.push(o.regpc&0xFF);
      o.flagb=1;
      o.push(o.getRegf());
      o.flagi=1;
      o.regpc=o.peekWord(o.IRQ_ADDR);
      return 7;
    },
    function i01(o){
      var addr=o.peekWord((o.peekByte(o.regpc)+o.regx)&0xFF);
      o.regpc=(o.regpc+1)&0xFFFF;
      o.setnz(o.rega|=o.load(addr));
      return 6;
    },
    function i02(o){
      return 0;
    },
    function i03(o){
      return 0;
    },
    function i04(o){
      return 0;
    },
    function i05(o){
      var addr=o.peekByte(o.regpc);
      o.regpc=(o.regpc+1)&0xFFFF;
      o.setnz(o.rega|=o.load(addr));
      return 3;
    },
    function i06(o){
      var addr=o.peekByte(o.regpc);
      o.regpc=(o.regpc+1)&0xFFFF;
      var t=o.load(addr);
      o.flagc=t>>>7;
      o.store(addr,o.setnz((t<<1)&0xFF));
      return 5;
    },
    function i07(o){
      return 0;
    },
    function i08(o){
      o.push(o.getRegf());
      return 3;
    },
    function i09(o){
      var addr=o.regpc;
      o.regpc=(o.regpc+1)&0xFFFF;
      o.setnz(o.rega|=o.load(addr));
      return 2;
    },
    function i0A(o){
      o.flagc=o.rega>>>7;
      o.setnz(o.rega=(o.rega<<1)&0xFF);
      return 2;
    },
    function i0B(o){
      return 0;
    },
    function i0C(o){
      return 0;
    },
    function i0D(o){
      var addr=o.peekWord(o.regpc);
      o.regpc=(o.regpc+2)&0xFFFF;
      o.setnz(o.rega|=o.load(addr));
      return 4;
    },
    function i0E(o){
      var addr=o.peekWord(o.regpc);
      o.regpc=(o.regpc+2)&0xFFFF;
      var t=o.load(addr);
      o.flagc=t>>>7;
      o.store(addr,o.setnz((t<<1)&0xFF));
      return 6;
    },
    function i0F(o){
      return 0;
    },
    function i10(o){
      var clk=2;
      var addr=o.peekByte(o.regpc);
      o.regpc=(o.regpc+1)&0xFFFF;
      addr=(o.regpc+addr-((addr&0x80)<<1))&0xFFFF;
      if(!o.flagn){
        clk=(o.regpc^addr)&0xFF00?4:3;
        o.regpc=addr;
      }
      return clk;
    },
    function i11(o){
      var addr=o.peekWord(o.peekByte(o.regpc));
      var clk=(addr&0xFF)+o.regy&0xFF00?6:5;
      addr=(addr+o.regy)&0xFFFF;
      o.regpc=(o.regpc+1)&0xFFFF;
      o.setnz(o.rega|=o.load(addr));
      return clk;
    },
    function i12(o){
      return 0;
    },
    function i13(o){
      return 0;
    },
    function i14(o){
      return 0;
    },
    function i15(o){
      var addr=(o.peekByte(o.regpc)+o.regx)&0xFF;
      o.regpc=(o.regpc+1)&0xFFFF;
      o.setnz(o.rega|=o.load(addr));
      return 4;
    },
    function i16(o){
      var addr=(o.peekByte(o.regpc)+o.regx)&0xFF;
      o.regpc=(o.regpc+1)&0xFFFF;
      var t=o.load(addr);
      o.flagc=t>>>7;
      o.store(addr,o.setnz((t<<1)&0xFF));
      return 6;
    },
    function i17(o){
      return 0;
    },
    function i18(o){
      o.flagc=0;
      return 2;
    },
    function i19(o){
      var addr=o.peekWord(o.regpc);
      var clk=(addr&0xFF)+o.regy&0xFF00?5:4;
      addr=(addr+o.regy)&0xFFFF;
      o.regpc=(o.regpc+2)&0xFFFF;
      o.setnz(o.rega|=o.load(addr));
      return clk;
    },
    function i1A(o){
      return 0;
    },
    function i1B(o){
      return 0;
    },
    function i1C(o){
      return 0;
    },
    function i1D(o){
      var addr=o.peekWord(o.regpc);
      var clk=(addr&0xFF)+o.regx&0xFF00?5:4;
      addr=(addr+o.regx)&0xFFFF;
      o.regpc=(o.regpc+2)&0xFFFF;
      o.setnz(o.rega|=o.load(addr));
      return clk;
    },
    function i1E(o){
      var addr=o.peekWord(o.regpc);
      addr=(addr+o.regx)&0xFFFF;
      o.regpc=(o.regpc+2)&0xFFFF;
      var t=o.load(addr);
      o.flagc=t>>>7;
      o.store(addr,o.setnz((t<<1)&0xFF));
      return 7;
    },
    function i1F(o){
      return 0;
    },
    function i20(o){
      var addr=o.peekWord(o.regpc);
      o.regpc=(o.regpc+1)&0xFFFF;
      o.push(o.regpc>>>8);
      o.push(o.regpc&0xFF);
      o.regpc=addr;
      return 6;
    },
    function i21(o){
      var addr=o.peekWord((o.peekByte(o.regpc)+o.regx)&0xFF);
      o.regpc=(o.regpc+1)&0xFFFF;
      o.setnz(o.rega&=o.load(addr));
      return 6;
    },
    function i22(o){
      return 0;
    },
    function i23(o){
      return 0;
    },
    function i24(o){
      var addr=o.peekByte(o.regpc);
      o.regpc=(o.regpc+1)&0xFFFF;
      var t=o.load(addr);
      o.flagz=!(o.rega&t)|0;
      o.flagn=t>>>7;
      o.flagv=(t&0x40)>>>6;
      return 3;
    },
    function i25(o){
      var addr=o.peekByte(o.regpc);
      o.regpc=(o.regpc+1)&0xFFFF;
      o.setnz(o.rega&=o.load(addr));
      return 3;
    },
    function i26(o){
      var addr=o.peekByte(o.regpc);
      o.regpc=(o.regpc+1)&0xFFFF;
      var t=o.load(addr);
      o.store(addr,o.setnz(((t<<1)|o.flagc)&0xFF));
      o.flagc=t>>>7;
      return 5;
    },
    function i27(o){
      return 0;
    },
    function i28(o){
      o.setRegf(o.pop());
      return 4;
    },
    function i29(o){
      var addr=o.regpc;
      o.regpc=(o.regpc+1)&0xFFFF;
      o.setnz(o.rega&=o.load(addr));
      return 2;
    },
    function i2A(o){
      var t=o.flagc;
      o.flagc=o.rega>>>7;
      o.setnz(o.rega=((o.rega<<1)|t)&0xFF);
      return 2;
    },
    function i2B(o){
      return 0;
    },
    function i2C(o){
      var addr=o.peekWord(o.regpc);
      o.regpc=(o.regpc+2)&0xFFFF;
      var t=o.load(addr);
      o.flagz=!(o.rega&t)|0;
      o.flagn=t>>>7;
      o.flagv=(t&0x40)>>>6;
      return 4;
    },
    function i2D(o){
      var addr=o.peekWord(o.regpc);
      o.regpc=(o.regpc+2)&0xFFFF;
      o.setnz(o.rega&=o.load(addr));
      return 4;
    },
    function i2E(o){
      var addr=o.peekWord(o.regpc);
      o.regpc=(o.regpc+2)&0xFFFF;
      var t=o.load(addr);
      o.store(addr,o.setnz(((t<<1)|o.flagc)&0xFF));
      o.flagc=t>>>7;
      return 6;
    },
    function i2F(o){
      return 0;
    },
    function i30(o){
      var clk=2;
      var addr=o.peekByte(o.regpc);
      o.regpc=(o.regpc+1)&0xFFFF;
      addr=(o.regpc+addr-((addr&0x80)<<1))&0xFFFF;
      if(o.flagn){
        clk=(o.regpc^addr)&0xFF00?4:3;
        o.regpc=addr;
      }
      return clk;
    },
    function i31(o){
      var addr=o.peekWord(o.peekByte(o.regpc));
      var clk=(addr&0xFF)+o.regy&0xFF00?6:5;
      addr=(addr+o.regy)&0xFFFF;
      o.regpc=(o.regpc+1)&0xFFFF;
      o.setnz(o.rega&=o.load(addr));
      return clk;
    },
    function i32(o){
      return 0;
    },
    function i33(o){
      return 0;
    },
    function i34(o){
      return 0;
    },
    function i35(o){
      var addr=(o.peekByte(o.regpc)+o.regx)&0xFF;
      o.regpc=(o.regpc+1)&0xFFFF;
      o.setnz(o.rega&=o.load(addr));
      return 4;
    },
    function i36(o){
      var addr=(o.peekByte(o.regpc)+o.regx)&0xFF;
      o.regpc=(o.regpc+1)&0xFFFF;
      var t=o.load(addr);
      o.store(addr,o.setnz(((t<<1)|o.flagc)&0xFF));
      o.flagc=t>>>7;
      return 6;
    },
    function i37(o){
      return 0;
    },
    function i38(o){
      o.flagc=1;
      return 2;
    },
    function i39(o){
      var addr=o.peekWord(o.regpc);
      var clk=(addr&0xFF)+o.regy&0xFF00?5:4;
      addr=(addr+o.regy)&0xFFFF;
      o.regpc=(o.regpc+2)&0xFFFF;
      o.setnz(o.rega&=o.load(addr));
      return clk;
    },
    function i3A(o){
      return 0;
    },
    function i3B(o){
      return 0;
    },
    function i3C(o){
      return 0;
    },
    function i3D(o){
      var addr=o.peekWord(o.regpc);
      var clk=(addr&0xFF)+o.regx&0xFF00?5:4;
      addr=(addr+o.regx)&0xFFFF;
      o.regpc=(o.regpc+2)&0xFFFF;
      o.setnz(o.rega&=o.load(addr));
      return clk;
    },
    function i3E(o){
      var addr=o.peekWord(o.regpc);
      addr=(addr+o.regx)&0xFFFF;
      o.regpc=(o.regpc+2)&0xFFFF;
      var t=o.load(addr);
      o.store(addr,o.setnz(((t<<1)|o.flagc)&0xFF));
      o.flagc=t>>>7;
      return 7;
    },
    function i3F(o){
      return 0;
    },
    function i40(o){
      o.setRegf(o.pop());
      o.regpc=(o.pop()|(o.pop()<<8));
      return 6;
    },
    function i41(o){
      var addr=o.peekWord((o.peekByte(o.regpc)+o.regx)&0xFF);
      o.regpc=(o.regpc+1)&0xFFFF;
      o.setnz(o.rega^=o.load(addr));
      return 6;
    },
    function i42(o){
      return 0;
    },
    function i43(o){
      return 0;
    },
    function i44(o){
      return 0;
    },
    function i45(o){
      var addr=o.peekByte(o.regpc);
      o.regpc=(o.regpc+1)&0xFFFF;
      o.setnz(o.rega^=o.load(addr));
      return 3;
    },
    function i46(o){
      var addr=o.peekByte(o.regpc);
      o.regpc=(o.regpc+1)&0xFFFF;
      var t=o.load(addr);
      o.flagc=t&0x01;
      t>>>=1;
      o.flagn=0;
      o.flagz=!t|0;
      o.store(addr,t);
      return 5;
    },
    function i47(o){
      return 0;
    },
    function i48(o){
      o.push(o.rega);
      return 3;
    },
    function i49(o){
      var addr=o.regpc;
      o.regpc=(o.regpc+1)&0xFFFF;
      o.setnz(o.rega^=o.load(addr));
      return 2;
    },
    function i4A(o){
      o.flagc=o.rega&0x01;
      o.setnz(o.rega>>>=1);
      return 2;
    },
    function i4B(o){
      return 0;
    },
    function i4C(o){
      var addr=o.peekWord(o.regpc);
      o.regpc=(o.regpc+2)&0xFFFF;
      o.regpc=addr;
      return 3;
    },
    function i4D(o){
      var addr=o.peekWord(o.regpc);
      o.regpc=(o.regpc+2)&0xFFFF;
      o.setnz(o.rega^=o.load(addr));
      return 4;
    },
    function i4E(o){
      var addr=o.peekWord(o.regpc);
      o.regpc=(o.regpc+2)&0xFFFF;
      var t=o.load(addr);
      o.flagc=t&0x01;
      t>>>=1;
      o.flagn=0;
      o.flagz=!t|0;
      o.store(addr,t);
      return 6;
    },
    function i4F(o){
      return 0;
    },
    function i50(o){
      var clk=2;
      var addr=o.peekByte(o.regpc);
      o.regpc=(o.regpc+1)&0xFFFF;
      addr=(o.regpc+addr-((addr&0x80)<<1))&0xFFFF;
      if(!o.flagv){
        clk=(o.regpc^addr)&0xFF00?4:3;
        o.regpc=addr;
      }
      return clk;
    },
    function i51(o){
      var addr=o.peekWord(o.peekByte(o.regpc));
      var clk=(addr&0xFF)+o.regy&0xFF00?6:5;
      addr=(addr+o.regy)&0xFFFF;
      o.regpc=(o.regpc+1)&0xFFFF;
      o.setnz(o.rega^=o.load(addr));
      return clk;
    },
    function i52(o){
      return 0;
    },
    function i53(o){
      return 0;
    },
    function i54(o){
      return 0;
    },
    function i55(o){
      var addr=(o.peekByte(o.regpc)+o.regx)&0xFF;
      o.regpc=(o.regpc+1)&0xFFFF;
      o.setnz(o.rega^=o.load(addr));
      return 4;
    },
    function i56(o){
      var addr=(o.peekByte(o.regpc)+o.regx)&0xFF;
      o.regpc=(o.regpc+1)&0xFFFF;
      var t=o.load(addr);
      o.flagc=t&0x01;
      t>>>=1;
      o.flagn=0;
      o.flagz=!t|0;
      o.store(addr,t);
      return 6;
    },
    function i57(o){
      return 0;
    },
    function i58(o){
      o.flagi=0;
      return 2;
    },
    function i59(o){
      var addr=o.peekWord(o.regpc);
      var clk=(addr&0xFF)+o.regy&0xFF00?5:4;
      addr=(addr+o.regy)&0xFFFF;
      o.regpc=(o.regpc+2)&0xFFFF;
      o.setnz(o.rega^=o.load(addr));
      return clk;
    },
    function i5A(o){
      return 0;
    },
    function i5B(o){
      return 0;
    },
    function i5C(o){
      return 0;
    },
    function i5D(o){
      var addr=o.peekWord(o.regpc);
      var clk=(addr&0xFF)+o.regx&0xFF00?5:4;
      addr=(addr+o.regx)&0xFFFF;
      o.regpc=(o.regpc+2)&0xFFFF;
      o.setnz(o.rega^=o.load(addr));
      return clk;
    },
    function i5E(o){
      var addr=o.peekWord(o.regpc);
      addr=(addr+o.regx)&0xFFFF;
      o.regpc=(o.regpc+2)&0xFFFF;
      var t=o.load(addr);
      o.flagc=t&0x01;
      t>>>=1;
      o.flagn=0;
      o.flagz=!t|0;
      o.store(addr,t);
      return 7;
    },
    function i5F(o){
      return 0;
    },
    function i60(o){
      o.regpc=((o.pop()|(o.pop()<<8))+1)&0xFFFF;
      return 6;
    },
    function i61(o){
      var addr=o.peekWord((o.peekByte(o.regpc)+o.regx)&0xFF);
      o.regpc=(o.regpc+1)&0xFFFF;
      var t1=o.load(addr);
      var t2=(o.rega+t1+o.flagc)|0;
      o.flagc=(t2>0xFF)|0;
      o.flagv=((o.rega^t1^0x80)&(o.rega^t2)&0x80)>>>7;
      o.setnz(o.rega=t2&0xFF);
      return 6;
    },
    function i62(o){
      return 0;
    },
    function i63(o){
      return 0;
    },
    function i64(o){
      return 0;
    },
    function i65(o){
      var addr=o.peekByte(o.regpc);
      o.regpc=(o.regpc+1)&0xFFFF;
      var t1=o.load(addr);
      var t2=(o.rega+t1+o.flagc)|0;
      o.flagc=(t2>0xFF)|0;
      o.flagv=((o.rega^t1^0x80)&(o.rega^t2)&0x80)>>>7;
      o.setnz(o.rega=t2&0xFF);
      return 3;
    },
    function i66(o){
      var addr=o.peekByte(o.regpc);
      o.regpc=(o.regpc+1)&0xFFFF;
      var t=o.load(addr);
      o.store(addr,o.setnz((t>>>1)|(o.flagc<<7)));
      o.flagc=t&0x01;
      return 5;
    },
    function i67(o){
      return 0;
    },
    function i68(o){
      o.setnz(o.rega=o.pop());
      return 4;
    },
    function i69(o){
      var addr=o.regpc;
      o.regpc=(o.regpc+1)&0xFFFF;
      var t1=o.load(addr);
      var t2=(o.rega+t1+o.flagc)|0;
      o.flagc=(t2>0xFF)|0;
      o.flagv=((o.rega^t1^0x80)&(o.rega^t2)&0x80)>>>7;
      o.setnz(o.rega=t2&0xFF);
      return 2;
    },
    function i6A(o){
      var t=o.flagc;
      o.flagc=o.rega&0x01;
      o.setnz(o.rega=(o.rega>>>1)|(t<<7));
      return 2;
    },
    function i6B(o){
      return 0;
    },
    function i6C(o){
      var addr=o.peekWord(o.peekWord(o.regpc));
      o.regpc=(o.regpc+2)&0xFFFF;
      o.regpc=addr;
      return 5;
    },
    function i6D(o){
      var addr=o.peekWord(o.regpc);
      o.regpc=(o.regpc+2)&0xFFFF;
      var t1=o.load(addr);
      var t2=(o.rega+t1+o.flagc)|0;
      o.flagc=(t2>0xFF)|0;
      o.flagv=((o.rega^t1^0x80)&(o.rega^t2)&0x80)>>>7;
      o.setnz(o.rega=t2&0xFF);
      return 4;
    },
    function i6E(o){
      var addr=o.peekWord(o.regpc);
      o.regpc=(o.regpc+2)&0xFFFF;
      var t=o.load(addr);
      o.store(addr,o.setnz((t>>>1)|(o.flagc<<7)));
      o.flagc=t&0x01;
      return 6;
    },
    function i6F(o){
      return 0;
    },
    function i70(o){
      var clk=2;
      var addr=o.peekByte(o.regpc);
      o.regpc=(o.regpc+1)&0xFFFF;
      addr=(o.regpc+addr-((addr&0x80)<<1))&0xFFFF;
      if(o.flagv){
        clk=(o.regpc^addr)&0xFF00?4:3;
        o.regpc=addr;
      }
      return clk;
    },
    function i71(o){
      var addr=o.peekWord(o.peekByte(o.regpc));
      var clk=(addr&0xFF)+o.regy&0xFF00?6:5;
      addr=(addr+o.regy)&0xFFFF;
      o.regpc=(o.regpc+1)&0xFFFF;
      var t1=o.load(addr);
      var t2=(o.rega+t1+o.flagc)|0;
      o.flagc=(t2>0xFF)|0;
      o.flagv=((o.rega^t1^0x80)&(o.rega^t2)&0x80)>>>7;
      o.setnz(o.rega=t2&0xFF);
      return clk;
    },
    function i72(o){
      return 0;
    },
    function i73(o){
      return 0;
    },
    function i74(o){
      return 0;
    },
    function i75(o){
      var addr=(o.peekByte(o.regpc)+o.regx)&0xFF;
      o.regpc=(o.regpc+1)&0xFFFF;
      var t1=o.load(addr);
      var t2=(o.rega+t1+o.flagc)|0;
      o.flagc=(t2>0xFF)|0;
      o.flagv=((o.rega^t1^0x80)&(o.rega^t2)&0x80)>>>7;
      o.setnz(o.rega=t2&0xFF);
      return 4;
    },
    function i76(o){
      var addr=(o.peekByte(o.regpc)+o.regx)&0xFF;
      o.regpc=(o.regpc+1)&0xFFFF;
      var t=o.load(addr);
      o.store(addr,o.setnz((t>>>1)|(o.flagc<<7)));
      o.flagc=t&0x01;
      return 6;
    },
    function i77(o){
      return 0;
    },
    function i78(o){
      o.flagi=1;
      return 2;
    },
    function i79(o){
      var addr=o.peekWord(o.regpc);
      var clk=(addr&0xFF)+o.regy&0xFF00?5:4;
      addr=(addr+o.regy)&0xFFFF;
      o.regpc=(o.regpc+2)&0xFFFF;
      var t1=o.load(addr);
      var t2=(o.rega+t1+o.flagc)|0;
      o.flagc=(t2>0xFF)|0;
      o.flagv=((o.rega^t1^0x80)&(o.rega^t2)&0x80)>>>7;
      o.setnz(o.rega=t2&0xFF);
      return clk;
    },
    function i7A(o){
      return 0;
    },
    function i7B(o){
      return 0;
    },
    function i7C(o){
      return 0;
    },
    function i7D(o){
      var addr=o.peekWord(o.regpc);
      var clk=(addr&0xFF)+o.regx&0xFF00?5:4;
      addr=(addr+o.regx)&0xFFFF;
      o.regpc=(o.regpc+2)&0xFFFF;
      var t1=o.load(addr);
      var t2=(o.rega+t1+o.flagc)|0;
      o.flagc=(t2>0xFF)|0;
      o.flagv=((o.rega^t1^0x80)&(o.rega^t2)&0x80)>>>7;
      o.setnz(o.rega=t2&0xFF);
      return clk;
    },
    function i7E(o){
      var addr=o.peekWord(o.regpc);
      addr=(addr+o.regx)&0xFFFF;
      o.regpc=(o.regpc+2)&0xFFFF;
      var t=o.load(addr);
      o.store(addr,o.setnz((t>>>1)|(o.flagc<<7)));
      o.flagc=t&0x01;
      return 7;
    },
    function i7F(o){
      return 0;
    },
    function i80(o){
      return 0;
    },
    function i81(o){
      var addr=o.peekWord((o.peekByte(o.regpc)+o.regx)&0xFF);
      o.regpc=(o.regpc+1)&0xFFFF;
      o.store(addr,o.rega);
      return 6;
    },
    function i82(o){
      return 0;
    },
    function i83(o){
      return 0;
    },
    function i84(o){
      var addr=o.peekByte(o.regpc);
      o.regpc=(o.regpc+1)&0xFFFF;
      o.store(addr,o.regy);
      return 3;
    },
    function i85(o){
      var addr=o.peekByte(o.regpc);
      o.regpc=(o.regpc+1)&0xFFFF;
      o.store(addr,o.rega);
      return 3;
    },
    function i86(o){
      var addr=o.peekByte(o.regpc);
      o.regpc=(o.regpc+1)&0xFFFF;
      o.store(addr,o.regx);
      return 3;
    },
    function i87(o){
      return 0;
    },
    function i88(o){
      o.setnz(o.regy=(o.regy-1)&0xFF);
      return 2;
    },
    function i89(o){
      return 0;
    },
    function i8A(o){
      o.setnz(o.rega=o.regx);
      return 2;
    },
    function i8B(o){
      return 0;
    },
    function i8C(o){
      var addr=o.peekWord(o.regpc);
      o.regpc=(o.regpc+2)&0xFFFF;
      o.store(addr,o.regy);
      return 4;
    },
    function i8D(o){
      var addr=o.peekWord(o.regpc);
      o.regpc=(o.regpc+2)&0xFFFF;
      o.store(addr,o.rega);
      return 4;
    },
    function i8E(o){
      var addr=o.peekWord(o.regpc);
      o.regpc=(o.regpc+2)&0xFFFF;
      o.store(addr,o.regx);
      return 4;
    },
    function i8F(o){
      return 0;
    },
    function i90(o){
      var clk=2;
      var addr=o.peekByte(o.regpc);
      o.regpc=(o.regpc+1)&0xFFFF;
      addr=(o.regpc+addr-((addr&0x80)<<1))&0xFFFF;
      if(!o.flagc){
        clk=(o.regpc^addr)&0xFF00?4:3;
        o.regpc=addr;
      }
      return clk;
    },
    function i91(o){
      var addr=o.peekWord(o.peekByte(o.regpc));
      addr=(addr+o.regy)&0xFFFF;
      o.regpc=(o.regpc+1)&0xFFFF;
      o.store(addr,o.rega);
      return 6;
    },
    function i92(o){
      return 0;
    },
    function i93(o){
      return 0;
    },
    function i94(o){
      var addr=(o.peekByte(o.regpc)+o.regx)&0xFF;
      o.regpc=(o.regpc+1)&0xFFFF;
      o.store(addr,o.regy);
      return 4;
    },
    function i95(o){
      var addr=(o.peekByte(o.regpc)+o.regx)&0xFF;
      o.regpc=(o.regpc+1)&0xFFFF;
      o.store(addr,o.rega);
      return 4;
    },
    function i96(o){
      var addr=(o.peekByte(o.regpc)+o.regy)&0xFF;
      o.regpc=(o.regpc+1)&0xFFFF;
      o.store(addr,o.regx);
      return 4;
    },
    function i97(o){
      return 0;
    },
    function i98(o){
      o.setnz(o.rega=o.regy);
      return 2;
    },
    function i99(o){
      var addr=o.peekWord(o.regpc);
      addr=(addr+o.regy)&0xFFFF;
      o.regpc=(o.regpc+2)&0xFFFF;
      o.store(addr,o.rega);
      return 5;
    },
    function i9A(o){
      o.regs=o.regx;
      return 2;
    },
    function i9B(o){
      return 0;
    },
    function i9C(o){
      return 0;
    },
    function i9D(o){
      var addr=o.peekWord(o.regpc);
      addr=(addr+o.regx)&0xFFFF;
      o.regpc=(o.regpc+2)&0xFFFF;
      o.store(addr,o.rega);
      return 5;
    },
    function i9E(o){
      return 0;
    },
    function i9F(o){
      return 0;
    },
    function iA0(o){
      var addr=o.regpc;
      o.regpc=(o.regpc+1)&0xFFFF;
      o.setnz(o.regy=o.load(addr));
      return 2;
    },
    function iA1(o){
      var addr=o.peekWord((o.peekByte(o.regpc)+o.regx)&0xFF);
      o.regpc=(o.regpc+1)&0xFFFF;
      o.setnz(o.rega=o.load(addr));
      return 6;
    },
    function iA2(o){
      var addr=o.regpc;
      o.regpc=(o.regpc+1)&0xFFFF;
      o.setnz(o.regx=o.load(addr));
      return 2;
    },
    function iA3(o){
      return 0;
    },
    function iA4(o){
      var addr=o.peekByte(o.regpc);
      o.regpc=(o.regpc+1)&0xFFFF;
      o.setnz(o.regy=o.load(addr));
      return 3;
    },
    function iA5(o){
      var addr=o.peekByte(o.regpc);
      o.regpc=(o.regpc+1)&0xFFFF;
      o.setnz(o.rega=o.load(addr));
      return 3;
    },
    function iA6(o){
      var addr=o.peekByte(o.regpc);
      o.regpc=(o.regpc+1)&0xFFFF;
      o.setnz(o.regx=o.load(addr));
      return 3;
    },
    function iA7(o){
      return 0;
    },
    function iA8(o){
      o.setnz(o.regy=o.rega);
      return 2;
    },
    function iA9(o){
      var addr=o.regpc;
      o.regpc=(o.regpc+1)&0xFFFF;
      o.setnz(o.rega=o.load(addr));
      return 2;
    },
    function iAA(o){
      o.setnz(o.regx=o.rega);
      return 2;
    },
    function iAB(o){
      return 0;
    },
    function iAC(o){
      var addr=o.peekWord(o.regpc);
      o.regpc=(o.regpc+2)&0xFFFF;
      o.setnz(o.regy=o.load(addr));
      return 4;
    },
    function iAD(o){
      var addr=o.peekWord(o.regpc);
      o.regpc=(o.regpc+2)&0xFFFF;
      o.setnz(o.rega=o.load(addr));
      return 4;
    },
    function iAE(o){
      var addr=o.peekWord(o.regpc);
      o.regpc=(o.regpc+2)&0xFFFF;
      o.setnz(o.regx=o.load(addr));
      return 4;
    },
    function iAF(o){
      return 0;
    },
    function iB0(o){
      var clk=2;
      var addr=o.peekByte(o.regpc);
      o.regpc=(o.regpc+1)&0xFFFF;
      addr=(o.regpc+addr-((addr&0x80)<<1))&0xFFFF;
      if(o.flagc){
        clk=(o.regpc^addr)&0xFF00?4:3;
        o.regpc=addr;
      }
      return clk;
    },
    function iB1(o){
      var addr=o.peekWord(o.peekByte(o.regpc));
      var clk=(addr&0xFF)+o.regy&0xFF00?6:5;
      addr=(addr+o.regy)&0xFFFF;
      o.regpc=(o.regpc+1)&0xFFFF;
      o.setnz(o.rega=o.load(addr));
      return clk;
    },
    function iB2(o){
      return 0;
    },
    function iB3(o){
      return 0;
    },
    function iB4(o){
      var addr=(o.peekByte(o.regpc)+o.regx)&0xFF;
      o.regpc=(o.regpc+1)&0xFFFF;
      o.setnz(o.regy=o.load(addr));
      return 4;
    },
    function iB5(o){
      var addr=(o.peekByte(o.regpc)+o.regx)&0xFF;
      o.regpc=(o.regpc+1)&0xFFFF;
      o.setnz(o.rega=o.load(addr));
      return 4;
    },
    function iB6(o){
      var addr=(o.peekByte(o.regpc)+o.regy)&0xFF;
      o.regpc=(o.regpc+1)&0xFFFF;
      o.setnz(o.regx=o.load(addr));
      return 4;
    },
    function iB7(o){
      return 0;
    },
    function iB8(o){
      o.flagv=0;
      return 2;
    },
    function iB9(o){
      var addr=o.peekWord(o.regpc);
      var clk=(addr&0xFF)+o.regy&0xFF00?5:4;
      addr=(addr+o.regy)&0xFFFF;
      o.regpc=(o.regpc+2)&0xFFFF;
      o.setnz(o.rega=o.load(addr));
      return clk;
    },
    function iBA(o){
      o.setnz(o.regx=o.regs);
      return 2;
    },
    function iBB(o){
      return 0;
    },
    function iBC(o){
      var addr=o.peekWord(o.regpc);
      var clk=(addr&0xFF)+o.regx&0xFF00?5:4;
      addr=(addr+o.regx)&0xFFFF;
      o.regpc=(o.regpc+2)&0xFFFF;
      o.setnz(o.regy=o.load(addr));
      return clk;
    },
    function iBD(o){
      var addr=o.peekWord(o.regpc);
      var clk=(addr&0xFF)+o.regx&0xFF00?5:4;
      addr=(addr+o.regx)&0xFFFF;
      o.regpc=(o.regpc+2)&0xFFFF;
      o.setnz(o.rega=o.load(addr));
      return clk;
    },
    function iBE(o){
      var addr=o.peekWord(o.regpc);
      var clk=(addr&0xFF)+o.regy&0xFF00?5:4;
      addr=(addr+o.regy)&0xFFFF;
      o.regpc=(o.regpc+2)&0xFFFF;
      o.setnz(o.regx=o.load(addr));
      return clk;
    },
    function iBF(o){
      return 0;
    },
    function iC0(o){
      var addr=o.regpc;
      o.regpc=(o.regpc+1)&0xFFFF;
      var t=o.regy-o.load(addr);
      o.flagc=(t>=0)|0;
      o.setnz(t);
      return 2;
    },
    function iC1(o){
      var addr=o.peekWord((o.peekByte(o.regpc)+o.regx)&0xFF);
      o.regpc=(o.regpc+1)&0xFFFF;
      var t=o.rega-o.load(addr);
      o.flagc=(t>=0)|0;
      o.setnz(t);
      return 6;
    },
    function iC2(o){
      return 0;
    },
    function iC3(o){
      return 0;
    },
    function iC4(o){
      var addr=o.peekByte(o.regpc);
      o.regpc=(o.regpc+1)&0xFFFF;
      var t=o.regy-o.load(addr);
      o.flagc=(t>=0)|0;
      o.setnz(t);
      return 3;
    },
    function iC5(o){
      var addr=o.peekByte(o.regpc);
      o.regpc=(o.regpc+1)&0xFFFF;
      var t=o.rega-o.load(addr);
      o.flagc=(t>=0)|0;
      o.setnz(t);
      return 3;
    },
    function iC6(o){
      var addr=o.peekByte(o.regpc);
      o.regpc=(o.regpc+1)&0xFFFF;
      o.store(addr,o.setnz((o.load(addr)-1)&0xFF));
      return 5;
    },
    function iC7(o){
      return 0;
    },
    function iC8(o){
      o.setnz(o.regy=(o.regy+1)&0xFF);
      return 2;
    },
    function iC9(o){
      var addr=o.regpc;
      o.regpc=(o.regpc+1)&0xFFFF;
      var t=o.rega-o.load(addr);
      o.flagc=(t>=0)|0;
      o.setnz(t);
      return 2;
    },
    function iCA(o){
      o.setnz(o.regx=(o.regx-1)&0xFF);
      return 2;
    },
    function iCB(o){
      return 0;
    },
    function iCC(o){
      var addr=o.peekWord(o.regpc);
      o.regpc=(o.regpc+2)&0xFFFF;
      var t=o.regy-o.load(addr);
      o.flagc=(t>=0)|0;
      o.setnz(t);
      return 4;
    },
    function iCD(o){
      var addr=o.peekWord(o.regpc);
      o.regpc=(o.regpc+2)&0xFFFF;
      var t=o.rega-o.load(addr);
      o.flagc=(t>=0)|0;
      o.setnz(t);
      return 4;
    },
    function iCE(o){
      var addr=o.peekWord(o.regpc);
      o.regpc=(o.regpc+2)&0xFFFF;
      o.store(addr,o.setnz((o.load(addr)-1)&0xFF));
      return 6;
    },
    function iCF(o){
      return 0;
    },
    function iD0(o){
      var clk=2;
      var addr=o.peekByte(o.regpc);
      o.regpc=(o.regpc+1)&0xFFFF;
      addr=(o.regpc+addr-((addr&0x80)<<1))&0xFFFF;
      if(!o.flagz){
        clk=(o.regpc^addr)&0xFF00?4:3;
        o.regpc=addr;
      }
      return clk;
    },
    function iD1(o){
      var addr=o.peekWord(o.peekByte(o.regpc));
      var clk=(addr&0xFF)+o.regy&0xFF00?6:5;
      addr=(addr+o.regy)&0xFFFF;
      o.regpc=(o.regpc+1)&0xFFFF;
      var t=o.rega-o.load(addr);
      o.flagc=(t>=0)|0;
      o.setnz(t);
      return clk;
    },
    function iD2(o){
      return 0;
    },
    function iD3(o){
      return 0;
    },
    function iD4(o){
      return 0;
    },
    function iD5(o){
      var addr=(o.peekByte(o.regpc)+o.regx)&0xFF;
      o.regpc=(o.regpc+1)&0xFFFF;
      var t=o.rega-o.load(addr);
      o.flagc=(t>=0)|0;
      o.setnz(t);
      return 4;
    },
    function iD6(o){
      var addr=(o.peekByte(o.regpc)+o.regx)&0xFF;
      o.regpc=(o.regpc+1)&0xFFFF;
      o.store(addr,o.setnz((o.load(addr)-1)&0xFF));
      return 6;
    },
    function iD7(o){
      return 0;
    },
    function iD8(o){
      o.flagd=0;
      return 2;
    },
    function iD9(o){
      var addr=o.peekWord(o.regpc);
      var clk=(addr&0xFF)+o.regy&0xFF00?5:4;
      addr=(addr+o.regy)&0xFFFF;
      o.regpc=(o.regpc+2)&0xFFFF;
      var t=o.rega-o.load(addr);
      o.flagc=(t>=0)|0;
      o.setnz(t);
      return clk;
    },
    function iDA(o){
      return 0;
    },
    function iDB(o){
      return 0;
    },
    function iDC(o){
      return 0;
    },
    function iDD(o){
      var addr=o.peekWord(o.regpc);
      var clk=(addr&0xFF)+o.regx&0xFF00?5:4;
      addr=(addr+o.regx)&0xFFFF;
      o.regpc=(o.regpc+2)&0xFFFF;
      var t=o.rega-o.load(addr);
      o.flagc=(t>=0)|0;
      o.setnz(t);
      return clk;
    },
    function iDE(o){
      var addr=o.peekWord(o.regpc);
      addr=(addr+o.regx)&0xFFFF;
      o.regpc=(o.regpc+2)&0xFFFF;
      o.store(addr,o.setnz((o.load(addr)-1)&0xFF));
      return 7;
    },
    function iDF(o){
      return 0;
    },
    function iE0(o){
      var addr=o.regpc;
      o.regpc=(o.regpc+1)&0xFFFF;
      var t=o.regx-o.load(addr);
      o.flagc=(t>=0)|0;
      o.setnz(t);
      return 2;
    },
    function iE1(o){
      var addr=o.peekWord((o.peekByte(o.regpc)+o.regx)&0xFF);
      o.regpc=(o.regpc+1)&0xFFFF;
      var t1=o.load(addr);
      var t2=(o.rega-t1+o.flagc-1)|0;
      o.flagc=(t2>=0)|0;
      o.flagv=((o.rega^t1)&(o.rega^t2)&0x80)>>>7;
      o.setnz(o.rega=t2&0xFF);
      return 6;
    },
    function iE2(o){
      return 0;
    },
    function iE3(o){
      return 0;
    },
    function iE4(o){
      var addr=o.peekByte(o.regpc);
      o.regpc=(o.regpc+1)&0xFFFF;
      var t=o.regx-o.load(addr);
      o.flagc=(t>=0)|0;
      o.setnz(t);
      return 3;
    },
    function iE5(o){
      var addr=o.peekByte(o.regpc);
      o.regpc=(o.regpc+1)&0xFFFF;
      var t1=o.load(addr);
      var t2=(o.rega-t1+o.flagc-1)|0;
      o.flagc=(t2>=0)|0;
      o.flagv=((o.rega^t1)&(o.rega^t2)&0x80)>>>7;
      o.setnz(o.rega=t2&0xFF);
      return 3;
    },
    function iE6(o){
      var addr=o.peekByte(o.regpc);
      o.regpc=(o.regpc+1)&0xFFFF;
      o.store(addr,o.setnz((o.load(addr)+1)&0xFF));
      return 5;
    },
    function iE7(o){
      return 0;
    },
    function iE8(o){
      o.setnz(o.regx=(o.regx+1)&0xFF);
      return 2;
    },
    function iE9(o){
      var addr=o.regpc;
      o.regpc=(o.regpc+1)&0xFFFF;
      var t1=o.load(addr);
      var t2=(o.rega-t1+o.flagc-1)|0;
      o.flagc=(t2>=0)|0;
      o.flagv=((o.rega^t1)&(o.rega^t2)&0x80)>>>7;
      o.setnz(o.rega=t2&0xFF);
      return 2;
    },
    function iEA(o){
      return 2;
    },
    function iEB(o){
      return 0;
    },
    function iEC(o){
      var addr=o.peekWord(o.regpc);
      o.regpc=(o.regpc+2)&0xFFFF;
      var t=o.regx-o.load(addr);
      o.flagc=(t>=0)|0;
      o.setnz(t);
      return 4;
    },
    function iED(o){
      var addr=o.peekWord(o.regpc);
      o.regpc=(o.regpc+2)&0xFFFF;
      var t1=o.load(addr);
      var t2=(o.rega-t1+o.flagc-1)|0;
      o.flagc=(t2>=0)|0;
      o.flagv=((o.rega^t1)&(o.rega^t2)&0x80)>>>7;
      o.setnz(o.rega=t2&0xFF);
      return 4;
    },
    function iEE(o){
      var addr=o.peekWord(o.regpc);
      o.regpc=(o.regpc+2)&0xFFFF;
      o.store(addr,o.setnz((o.load(addr)+1)&0xFF));
      return 6;
    },
    function iEF(o){
      return 0;
    },
    function iF0(o){
      var clk=2;
      var addr=o.peekByte(o.regpc);
      o.regpc=(o.regpc+1)&0xFFFF;
      addr=(o.regpc+addr-((addr&0x80)<<1))&0xFFFF;
      if(o.flagz){
        clk=(o.regpc^addr)&0xFF00?4:3;
        o.regpc=addr;
      }
      return clk;
    },
    function iF1(o){
      var addr=o.peekWord(o.peekByte(o.regpc));
      var clk=(addr&0xFF)+o.regy&0xFF00?6:5;
      addr=(addr+o.regy)&0xFFFF;
      o.regpc=(o.regpc+1)&0xFFFF;
      var t1=o.load(addr);
      var t2=(o.rega-t1+o.flagc-1)|0;
      o.flagc=(t2>=0)|0;
      o.flagv=((o.rega^t1)&(o.rega^t2)&0x80)>>>7;
      o.setnz(o.rega=t2&0xFF);
      return clk;
    },
    function iF2(o){
      return 0;
    },
    function iF3(o){
      return 0;
    },
    function iF4(o){
      return 0;
    },
    function iF5(o){
      var addr=(o.peekByte(o.regpc)+o.regx)&0xFF;
      o.regpc=(o.regpc+1)&0xFFFF;
      var t1=o.load(addr);
      var t2=(o.rega-t1+o.flagc-1)|0;
      o.flagc=(t2>=0)|0;
      o.flagv=((o.rega^t1)&(o.rega^t2)&0x80)>>>7;
      o.setnz(o.rega=t2&0xFF);
      return 4;
    },
    function iF6(o){
      var addr=(o.peekByte(o.regpc)+o.regx)&0xFF;
      o.regpc=(o.regpc+1)&0xFFFF;
      o.store(addr,o.setnz((o.load(addr)+1)&0xFF));
      return 6;
    },
    function iF7(o){
      return 0;
    },
    function iF8(o){
      o.flagd=1;
      return 2;
    },
    function iF9(o){
      var addr=o.peekWord(o.regpc);
      var clk=(addr&0xFF)+o.regy&0xFF00?5:4;
      addr=(addr+o.regy)&0xFFFF;
      o.regpc=(o.regpc+2)&0xFFFF;
      var t1=o.load(addr);
      var t2=(o.rega-t1+o.flagc-1)|0;
      o.flagc=(t2>=0)|0;
      o.flagv=((o.rega^t1)&(o.rega^t2)&0x80)>>>7;
      o.setnz(o.rega=t2&0xFF);
      return clk;
    },
    function iFA(o){
      return 0;
    },
    function iFB(o){
      return 0;
    },
    function iFC(o){
      return 0;
    },
    function iFD(o){
      var addr=o.peekWord(o.regpc);
      var clk=(addr&0xFF)+o.regx&0xFF00?5:4;
      addr=(addr+o.regx)&0xFFFF;
      o.regpc=(o.regpc+2)&0xFFFF;
      var t1=o.load(addr);
      var t2=(o.rega-t1+o.flagc-1)|0;
      o.flagc=(t2>=0)|0;
      o.flagv=((o.rega^t1)&(o.rega^t2)&0x80)>>>7;
      o.setnz(o.rega=t2&0xFF);
      return clk;
    },
    function iFE(o){
      var addr=o.peekWord(o.regpc);
      addr=(addr+o.regx)&0xFFFF;
      o.regpc=(o.regpc+2)&0xFFFF;
      o.store(addr,o.setnz((o.load(addr)+1)&0xFF));
      return 7;
    },
    function iFF(o){
      return 0;
    }
  ];
  // NC1020 IO functions
  (function(){
    var readXX=function(o,addr){
      return o.pio[addr];
    };
    var read06=function(o,addr){
      return o.pio[addr];
    };
    // clock
    var read3B=function(o,addr){
      if(!(o.pio[0x3D]&0x03)){
        return o.clockBuff[0x3B]&0xFE;
      }
      return o.pio[addr];
    };
    var read3F=function(o,addr){
      var idx=o.pio[0x3E];
      return idx<80?o.clockBuff[idx]:0;
    };
    var writeXX=function(o,addr,val){
      o.pio[addr]=val;
    };
    // switch bank
    var write00=function(o,addr,val){
      var oldVal=o.pio[addr];
      o.pio[addr]=val;
      if(val!==oldVal){
        if(val<0x20){
          o.switchBank(o.norBanks[val]);
        }else if(val>=0x80){
          var volIdx=o.pio[0x0D];
          if(volIdx&0x01){
            o.switchBank(o.romVol1[val]);
          }else if(volIdx&0x02){
            o.switchBank(o.romVol2[val]);
          }else{
            o.switchBank(o.romVol0[val]);
          }
        }
      }
    };
    var write05=function(o,addr,val){
      var oldVal=o.pio[addr];
      o.pio[addr]=val;
      if((oldVal^val)&0x08){
        o.slept=!(val&0x08);
      }
    };
    var write06=function(o,addr,val){
      o.pio[addr]=val;
      if(!o.plcd){
        o.plcd=o.pref(o.ram,((o.pio[0x0C]&0x03)<<12)|(val<<4),1600);
      }
      o.pio[0x09]&=0xFE;
    };
    var write08=function(o,addr,val){
      o.pio[addr]=val;
      o.pio[0x0B]&=0xFE;
    };
    // keypad grid
    var write09=function(o,addr,val){
      o.pio[addr]=val;
      switch(val){
      case 0x01:
        o.pio[0x08]=o.keyGrid[0];
        break;
      case 0x02:
        o.pio[0x08]=o.keyGrid[1];
        break;
      case 0x04:
        o.pio[0x08]=o.keyGrid[2];
        break;
      case 0x08:
        o.pio[0x08]=o.keyGrid[3];
        break;
      case 0x10:
        o.pio[0x08]=o.keyGrid[4];
        break;
      case 0x20:
        o.pio[0x08]=o.keyGrid[5];
        break;
      case 0x40:
        o.pio[0x08]=o.keyGrid[6];
        break;
      case 0x80:
        o.pio[0x08]=o.keyGrid[7];
        break;
      case 0:
        o.pio[0x0B]|=1;
        if(o.keyGrid[7]===0xFE){
          o.pio[0x0B]&=0xFE;
        }
        break;
      case 0x7F:
        if(o.pio[0x15]===0x7F){
          o.pio[0x08]=(o.keyGrid[0]|o.keyGrid[1]|o.keyGrid[2]|o.keyGrid[3]|o.keyGrid[4]|o.keyGrid[5]|o.keyGrid[6]|o.keyGrid[7]);
        }
        break;
      }
    };
    // roabbs
    var write0A=function(o,addr,val){
      var oldVal=o.pio[addr];
      o.pio[addr]=val;
      if(val!==oldVal){
        o.memMap[6]=o.bbsPages[val&0x0F];
      }
    };
    // switch volume
    var write0D=function(o,addr,val){
      var oldVal=o.pio[addr];
      o.pio[addr]=val;
      if(val!==oldVal){
        var bankIdx=o.pio[0x00];
        var vol=(val&0x03===1?o.romVol1:val&0x03===3?o.romVol2:o.romVol0);
        o.fillBbsPage(vol);
        o.memMap[7]=o.pref(vol[0],0x2000,0x2000);
        var roaBbs=o.pio[0x0A];
        o.memMap[1]=(roaBbs&0x04?o.page2:o.page1);
        o.memMap[6]=o.bbsPages[roaBbs&0x0F];
        o.switchBank(vol[bankIdx]);
      }
    };
    // zp40 switch
    var write0F=function(o,addr,val){
      var oldVal=o.pio[addr];
      o.pio[addr]=val;
      oldVal&=0x07;
      val&=0x07;
      if(val!==oldVal){
        var ptrNew=o.get40Pt(val);
        if(oldVal){
          o.memCpy(o.get40Pt(oldVal),o.p40,0x40);
          o.memCpy(o.p40,val?ptrNew:o.bak40,0x40);
        }else{
          o.memCpy(o.bak40,o.p40,0x40);
          o.memCpy(o.p40,ptrNew,0x40);
        }
      }
    };
    var write20=function(o,addr,val){
      o.pio[addr]=val;
      if(val===0x80||val===0x40){
        o.memSet(o.wavBuff,0,0x20);
        o.pio[0x20]=0;
        o.wavFlag=1;
        o.wavIdx=0;
      }
    };
    var write23=function(o,addr,val){
      o.pio[addr]=val;
      if(val===0xC2){
        o.wavBuff[o.wavIdx]=o.pio[0x22];
      }else if(val===0xC4){
        if(o.wavIdx<0x20){
          o.wavBuff[o.wavIdx]=o.pio[0x22];
          o.wavIdx++;
        }
      }else if(val===0x80){
        o.pio[0x20]=0x80;
        o.wavFlag=0;
        if(o.wavIdx){
          if(!o.wavPlaying){
            o.genAndPlayWav();
            o.wavIdx=0;
          }
        }
      }
      if(o.wavPlaying){
        // TODO
      }
    };
    // clock
    var write3F=function(o,addr,val){
      o.pio[addr]=val;
      var idx=o.pio[0x3E];
      if(idx===0x0B){
        o.pio[0x3D]=0xF8;
        o.clockFlag|=val&0x07;
        o.clockBuff[0x0B]=val^((o.clockBuff[0x0B]^val)&0x7F);
      }else if(idx===0x0A){
        o.clockFlag|=val&0x07;
        o.clockBuff[0x0A]=val;
      }else if(idx>=0x07){
        o.clockBuff[idx%80]=val;
      }else if(!(o.clockBuff[0x0B]&0x80)){
        o.clockBuff[idx]=val;
      }
    };
    // region wqx.prototype.ioRead
    wqx.prototype.ioRead=[
      readXX, // 0x00
      readXX, // 0x01
      readXX, // 0x02
      readXX, // 0x03
      readXX, // 0x04
      readXX, // 0x05
      read06, // 0x06
      readXX, // 0x07
      readXX, // 0x08
      readXX, // 0x09
      readXX, // 0x0A
      readXX, // 0x0B
      readXX, // 0x0C
      readXX, // 0x0D
      readXX, // 0x0E
      readXX, // 0x0F
      readXX, // 0x10
      readXX, // 0x11
      readXX, // 0x12
      readXX, // 0x13
      readXX, // 0x14
      readXX, // 0x15
      readXX, // 0x16
      readXX, // 0x17
      readXX, // 0x18
      readXX, // 0x19
      readXX, // 0x1A
      readXX, // 0x1B
      readXX, // 0x1C
      readXX, // 0x1D
      readXX, // 0x1E
      readXX, // 0x1F
      readXX, // 0x20
      readXX, // 0x21
      readXX, // 0x22
      readXX, // 0x23
      readXX, // 0x24
      readXX, // 0x25
      readXX, // 0x26
      readXX, // 0x27
      readXX, // 0x28
      readXX, // 0x29
      readXX, // 0x2A
      readXX, // 0x2B
      readXX, // 0x2C
      readXX, // 0x2D
      readXX, // 0x2E
      readXX, // 0x2F
      readXX, // 0x30
      readXX, // 0x31
      readXX, // 0x32
      readXX, // 0x33
      readXX, // 0x34
      readXX, // 0x35
      readXX, // 0x36
      readXX, // 0x37
      readXX, // 0x38
      readXX, // 0x39
      readXX, // 0x3A
      read3B, // 0x3B
      readXX, // 0x3C
      readXX, // 0x3D
      readXX, // 0x3E
      read3F // 0x3F
    ];
    // region wqx.prototype.ioWrite
    wqx.prototype.ioWrite=[
      write00, // 0x00
      writeXX, // 0x01
      writeXX, // 0x02
      writeXX, // 0x03
      writeXX, // 0x04
      writeXX, // 0x05
      write06, // 0x06
      writeXX, // 0x07
      write08, // 0x08
      write09, // 0x09
      write0A, // 0x0A
      writeXX, // 0x0B
      writeXX, // 0x0C
      write0D, // 0x0D
      writeXX, // 0x0E
      write0F, // 0x0F
      writeXX, // 0x10
      writeXX, // 0x11
      writeXX, // 0x12
      writeXX, // 0x13
      writeXX, // 0x14
      writeXX, // 0x15
      writeXX, // 0x16
      writeXX, // 0x17
      writeXX, // 0x18
      writeXX, // 0x19
      writeXX, // 0x1A
      writeXX, // 0x1B
      writeXX, // 0x1C
      writeXX, // 0x1D
      writeXX, // 0x1E
      writeXX, // 0x1F
      write20, // 0x20
      writeXX, // 0x21
      writeXX, // 0x22
      write23, // 0x23
      writeXX, // 0x24
      writeXX, // 0x25
      writeXX, // 0x26
      writeXX, // 0x27
      writeXX, // 0x28
      writeXX, // 0x29
      writeXX, // 0x2A
      writeXX, // 0x2B
      writeXX, // 0x2C
      writeXX, // 0x2D
      writeXX, // 0x2E
      writeXX, // 0x2F
      writeXX, // 0x30
      writeXX, // 0x31
      writeXX, // 0x32
      writeXX, // 0x33
      writeXX, // 0x34
      writeXX, // 0x35
      writeXX, // 0x36
      writeXX, // 0x37
      writeXX, // 0x38
      writeXX, // 0x39
      writeXX, // 0x3A
      writeXX, // 0x3B
      writeXX, // 0x3C
      writeXX, // 0x3D
      writeXX, // 0x3E
      write3F // 0x3F
    ];
  })();
  // LCD sign pixel data table
  wqx.prototype.LCD_PIX_MAP=[
    // 0 number vertical
    [
      [1,8],
      [
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1
      ]
    ],
    // 1 number horizontal
    [
      [5,1],
      [
        1,1,1,1,1
      ]
    ],
    // 2 indicator on lcd right
    [
      [12,5],
      [
        1,1,1,1,1,1,1,1,1,1,0,0,
        1,1,1,1,1,1,1,1,1,1,1,0,
        1,1,1,1,1,1,1,1,1,1,1,1,
        1,1,1,1,1,1,1,1,1,1,1,0,
        1,1,1,1,1,1,1,1,1,1,0,0
      ]
    ],
    // 3 colon between numbers
    [
      [2,9],
      [
        1,1,
        1,1,
        1,1,
        0,0,
        0,0,
        0,0,
        1,1,
        1,1,
        1,1
      ]
    ],
    // 4 dot between numbers
    [
      [2,3],
      [
        1,1,
        1,1,
        1,1
      ]
    ],
    // 5 star sign
    [
      [11,10],
      [
        0,0,0,0,0,1,0,0,0,0,0,
        0,0,0,0,1,1,1,0,0,0,0,
        0,0,0,1,1,1,1,1,0,0,0,
        1,1,1,1,1,1,1,1,1,1,1,
        0,1,1,1,1,1,1,1,1,1,0,
        0,0,1,1,1,1,1,1,1,0,0,
        0,0,0,1,1,1,1,1,0,0,0,
        0,0,1,1,1,1,1,1,1,0,0,
        0,0,1,1,1,0,1,1,1,0,0,
        0,1,1,0,0,0,0,0,1,1,0
      ]
    ],
    // 6 double uparrow
    [
      [9,10],
      [
        0,0,0,0,1,0,0,0,0,
        0,0,0,1,1,1,0,0,0,
        0,0,1,1,1,1,1,0,0,
        0,1,1,1,1,1,1,1,0,
        1,1,1,1,1,1,1,1,1,
        0,0,0,0,1,0,0,0,0,
        0,0,0,1,1,1,0,0,0,
        0,0,1,1,1,1,1,0,0,
        0,1,1,1,1,1,1,1,0,
        1,1,1,1,1,1,1,1,1
      ]
    ],
    // 7 NUM indicator
    [
      [31,9],
      [
        0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,
        1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,
        1,0,0,0,1,0,0,0,1,0,0,0,0,1,0,0,0,1,0,0,0,0,1,0,0,0,1,0,0,0,1,
        1,0,0,0,1,1,0,0,1,0,0,0,0,1,0,0,0,1,0,0,0,0,1,1,0,1,1,0,0,0,1,
        1,0,0,0,1,0,1,0,1,0,0,0,0,1,0,0,0,1,0,0,0,0,1,0,1,0,1,0,0,0,1,
        1,0,0,0,1,0,0,1,1,0,0,0,0,1,0,0,0,1,0,0,0,0,1,0,0,0,1,0,0,0,1,
        1,0,0,0,1,0,0,0,1,0,0,0,0,0,1,1,1,0,0,0,0,0,1,0,0,0,1,0,0,0,1,
        1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,
        0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0
      ]
    ],
    // 8 ENG indicator
    [
      [31,9],
      [
        0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,
        1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,
        1,0,0,0,1,1,1,1,1,0,0,0,0,1,0,0,0,1,0,0,0,0,0,1,1,1,1,0,0,0,1,
        1,0,0,0,1,0,0,0,0,0,0,0,0,1,1,0,0,1,0,0,0,0,1,0,0,0,0,0,0,0,1,
        1,0,0,0,1,1,1,1,0,0,0,0,0,1,0,1,0,1,0,0,0,0,1,0,0,1,1,0,0,0,1,
        1,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,1,1,0,0,0,0,1,0,0,0,1,0,0,0,1,
        1,0,0,0,1,1,1,1,1,0,0,0,0,1,0,0,0,1,0,0,0,0,0,1,1,1,0,0,0,0,1,
        1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,
        0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0
      ]
    ],
    // 9 CAPS indicator
    [
      [31,9],
      [
        0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,
        1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,
        1,0,0,0,0,1,1,1,1,0,0,0,1,0,0,0,1,1,1,1,0,0,0,1,1,1,1,0,0,0,1,
        1,0,0,0,1,0,0,0,0,0,0,1,0,1,0,0,1,0,0,0,1,0,1,0,0,0,0,0,0,0,1,
        1,0,0,0,1,0,0,0,0,0,1,0,0,0,1,0,1,1,1,1,0,0,0,1,1,1,0,0,0,0,1,
        1,0,0,0,1,0,0,0,0,0,1,1,1,1,1,0,1,0,0,0,0,0,0,0,0,0,1,0,0,0,1,
        1,0,0,0,0,1,1,1,1,0,1,0,0,0,1,0,1,0,0,0,0,0,1,1,1,1,0,0,0,0,1,
        1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,
        0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0
      ]
    ],
    // 10 SHIFT indicator
    [
      [31,9],
      [
        0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,
        1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,
        1,0,0,1,1,1,1,0,1,0,0,0,1,0,1,1,1,0,1,1,1,1,1,0,1,1,1,1,1,0,1,
        1,0,1,0,0,0,0,0,1,0,0,0,1,0,0,1,0,0,1,0,0,0,0,0,0,0,1,0,0,0,1,
        1,0,0,1,1,1,0,0,1,1,1,1,1,0,0,1,0,0,1,1,1,1,0,0,0,0,1,0,0,0,1,
        1,0,0,0,0,0,1,0,1,0,0,0,1,0,0,1,0,0,1,0,0,0,0,0,0,0,1,0,0,0,1,
        1,0,1,1,1,1,0,0,1,0,0,0,1,0,1,1,1,0,1,0,0,0,0,0,0,0,1,0,0,0,1,
        1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,
        0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0
      ]
    ],
    // 11 VScrollBar process indicator
    [
      [6,10],
      [
        1,1,1,1,1,1,
        1,1,1,1,1,1,
        0,0,0,0,0,0,
        0,0,0,0,0,0,
        1,1,1,1,1,1,
        1,1,1,1,1,1,
        0,0,0,0,0,0,
        0,0,0,0,0,0,
        1,1,1,1,1,1,
        1,1,1,1,1,1
      ]
    ],
    // 12 lighting sign
    [
      [9,10],
      [
        0,0,0,0,0,0,1,1,1,
        0,0,0,0,1,1,1,1,0,
        0,0,1,1,1,1,1,0,0,
        1,1,1,1,1,1,0,0,0,
        0,1,1,1,1,1,1,0,0,
        0,0,1,1,1,1,1,1,0,
        0,0,0,1,1,1,1,1,1,
        0,0,1,1,1,1,1,0,0,
        0,1,1,1,1,0,0,0,0,
        1,1,1,0,0,0,0,0,0
      ]
    ],
    // 13 alarm bell sign
    [
      [11,10],
      [
        0,0,0,0,1,1,1,0,0,0,0,
        0,0,0,1,1,1,1,1,0,0,0,
        0,0,1,1,1,1,1,1,1,0,0,
        0,0,1,1,1,1,1,1,1,0,0,
        0,0,1,1,1,1,1,1,1,0,0,
        0,1,1,1,1,1,1,1,1,1,0,
        1,1,1,1,1,1,1,1,1,1,1,
        1,1,0,0,0,0,0,0,0,1,1,
        1,0,0,0,1,1,1,0,0,0,1,
        1,1,0,0,1,1,1,0,0,1,1
      ]
    ],
    // 14 musical note sign
    [
      [6,10],
      [
        0,0,0,1,0,0,
        0,0,0,1,1,0,
        0,0,0,1,0,1,
        0,0,0,1,0,1,
        0,0,0,1,1,0,
        0,0,1,1,0,0,
        0,1,1,1,0,0,
        1,1,1,1,0,0,
        1,1,1,0,0,0,
        1,1,1,0,0,0
      ]
    ],
    // 15 data communication sign
    [
      [14,10],
      [
        0,0,1,1,0,0,0,0,0,0,1,1,0,0,
        0,1,1,0,0,0,0,0,0,0,0,1,1,0,
        1,1,0,0,1,0,0,0,1,1,0,0,1,0,
        1,1,0,1,1,0,0,0,0,1,1,0,1,1,
        1,0,1,1,1,0,1,1,0,0,1,0,0,1,
        1,0,1,1,1,0,1,1,0,0,1,0,0,1,
        1,1,0,1,1,0,0,0,0,1,1,0,1,1,
        1,1,0,0,1,0,0,0,1,1,0,0,1,0,
        0,1,1,0,0,0,0,0,0,0,0,1,1,0,
        0,0,1,1,0,0,0,0,0,0,1,1,0,0
      ]
    ],
    // 16 loudspeaker sign
    [
      [12,9],
      [
        0,0,0,0,0,1,0,0,0,1,0,0,
        0,0,0,0,1,1,0,0,1,0,0,0,
        0,0,0,1,1,1,0,1,0,0,0,0,
        1,1,1,1,1,1,0,0,0,0,0,0,
        1,1,1,1,1,1,0,1,1,1,1,1,
        1,1,1,1,1,1,0,0,0,0,0,0,
        0,0,0,1,1,1,0,1,0,0,0,0,
        0,0,0,0,1,1,0,0,1,0,0,0,
        0,0,0,0,0,1,0,0,0,1,0,0
      ]
    ],
    // 17 ringing sign
    [
      [13,10],
      [
        0,0,1,0,0,0,0,0,0,0,1,0,0,
        0,1,0,0,0,0,0,0,0,0,0,1,0,
        1,0,0,1,0,1,1,1,0,1,0,0,1,
        1,0,1,0,0,1,0,1,0,0,1,0,1,
        1,0,1,0,1,0,0,0,1,0,1,0,1,
        1,0,1,0,1,1,1,1,1,0,1,0,1,
        1,0,1,0,1,0,0,0,1,0,1,0,1,
        1,0,0,1,0,1,1,1,0,1,0,0,1,
        0,1,0,0,0,0,0,0,0,0,0,1,0,
        0,0,1,0,0,0,0,0,0,0,1,0,0
      ]
    ],
    // 18 magnet needle sign
    [
      [11,9],
      [
        0,0,0,0,0,0,0,1,1,0,0,
        0,0,0,0,0,0,1,0,0,1,0,
        0,0,0,0,0,0,1,0,0,0,1,
        0,0,0,0,1,1,1,0,0,0,1,
        0,0,0,0,1,1,1,1,1,1,0,
        0,0,0,0,1,0,1,1,0,0,0,
        1,1,0,1,0,1,1,1,0,0,0,
        0,1,1,1,1,0,0,0,0,0,0,
        0,1,1,1,0,0,0,0,0,0,0
      ]
    ],
    // 19 tape sign
    [
      [12,7],
      [
        0,1,1,1,1,1,1,1,1,1,1,0,
        1,1,1,1,1,1,1,1,1,1,1,1,
        1,1,0,1,1,0,0,1,1,0,1,1,
        1,0,0,0,1,0,0,1,0,0,0,1,
        1,0,0,0,1,0,0,1,0,0,0,1,
        1,1,0,1,1,0,0,1,1,0,1,1,
        0,1,1,1,0,0,0,0,1,1,1,0
      ]
    ],
    // 20 horizontal line sign
    [
      [28,3],
      [
        1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
        1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
        1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1
      ]
    ],
    // 21 battery sign
    [
      [9,8],
      [
        0,0,1,1,1,1,1,0,0,
        1,1,1,0,0,0,1,1,1,
        1,0,0,0,1,0,0,0,1,
        1,0,0,1,1,1,0,0,1,
        1,0,0,0,1,0,0,0,1,
        1,1,1,1,1,1,1,1,1,
        1,1,1,0,0,0,1,1,1,
        1,1,1,1,1,1,1,1,1
      ]
    ],
    // 22 key sign
    [
      [13,8],
      [
        0,1,1,1,0,0,0,0,0,0,0,0,0,
        1,0,0,0,1,0,0,0,0,0,0,0,0,
        1,0,0,0,1,0,0,0,0,0,0,0,0,
        1,0,0,0,1,1,1,1,1,1,1,1,1,
        1,0,0,0,1,1,1,1,1,1,1,1,1,
        1,0,0,0,1,0,0,0,1,1,1,0,0,
        1,0,0,0,1,0,0,0,1,1,1,0,0,
        0,1,1,1,0,0,0,0,0,0,0,0,0
      ]
    ],
    // 23 double leftarrow
    [
      [10,9],
      [
        0,0,0,0,1,0,0,0,0,1,
        0,0,0,1,1,0,0,0,1,1,
        0,0,1,1,1,0,0,1,1,1,
        0,1,1,1,1,0,1,1,1,1,
        1,1,1,1,1,1,1,1,1,1,
        0,1,1,1,1,0,1,1,1,1,
        0,0,1,1,1,0,0,1,1,1,
        0,0,0,1,1,0,0,0,1,1,
        0,0,0,0,1,0,0,0,0,1
      ]
    ],
    // 24 double rightarrow
    [
      [10,9],
      [
        1,0,0,0,0,1,0,0,0,0,
        1,1,0,0,0,1,1,0,0,0,
        1,1,1,0,0,1,1,1,0,0,
        1,1,1,1,0,1,1,1,1,0,
        1,1,1,1,1,1,1,1,1,1,
        1,1,1,1,0,1,1,1,1,0,
        1,1,1,0,0,1,1,1,0,0,
        1,1,0,0,0,1,1,0,0,0,
        1,0,0,0,0,1,0,0,0,0
      ]
    ],
    // 25 leftarrow
    [
      [10,7],
      [
        0,0,0,1,0,0,0,0,0,0,
        0,0,1,1,0,0,0,0,0,0,
        0,1,1,1,1,1,1,1,1,1,
        1,1,1,1,1,1,1,1,1,1,
        0,1,1,1,1,1,1,1,1,1,
        0,0,1,1,0,0,0,0,0,0,
        0,0,0,1,0,0,0,0,0,0
      ]
    ],
    // 26 double downarrow
    [
      [9,10],
      [
        1,1,1,1,1,1,1,1,1,
        0,1,1,1,1,1,1,1,0,
        0,0,1,1,1,1,1,0,0,
        0,0,0,1,1,1,0,0,0,
        0,0,0,0,1,0,0,0,0,
        1,1,1,1,1,1,1,1,1,
        0,1,1,1,1,1,1,1,0,
        0,0,1,1,1,1,1,0,0,
        0,0,0,1,1,1,0,0,0,
        0,0,0,0,1,0,0,0,0
      ]
    ],
    // 27 VScrollBar downarrow
    [
      [8,6],
      [
        0,0,1,1,1,1,0,0,
        0,0,1,1,1,1,0,0,
        1,1,1,1,1,1,1,1,
        0,1,1,1,1,1,1,0,
        0,0,1,1,1,1,0,0,
        0,0,0,1,1,0,0,0
      ]
    ],
    // 28 HScrollBar process indicator
    [
      [8,7],
      [
        1,1,0,1,1,0,1,1,
        1,1,0,1,1,0,1,1,
        1,1,0,1,1,0,1,1,
        1,1,0,1,1,0,1,1,
        1,1,0,1,1,0,1,1,
        1,1,0,1,1,0,1,1,
        1,1,0,1,1,0,1,1
      ]
    ],
    // 29 rightarrow
    [
      [10,7],
      [
        0,0,0,0,0,0,1,0,0,0,
        0,0,0,0,0,0,1,1,0,0,
        1,1,1,1,1,1,1,1,1,0,
        1,1,1,1,1,1,1,1,1,1,
        1,1,1,1,1,1,1,1,1,0,
        0,0,0,0,0,0,1,1,0,0,
        0,0,0,0,0,0,1,0,0,0
      ]
    ],
    // 30 VScrollBar uparrow
    [
      [8,6],
      [
        0,0,0,1,1,0,0,0,
        0,0,1,1,1,1,0,0,
        0,1,1,1,1,1,1,0,
        1,1,1,1,1,1,1,1,
        0,0,1,1,1,1,0,0,
        0,0,1,1,1,1,0,0
      ]
    ],
    // 31 HScrollBar left border and arrow
    [
      [7,9],
      [
        1,0,0,0,0,0,1,
        1,0,0,0,1,0,1,
        1,0,0,1,1,0,1,
        1,0,1,1,1,0,1,
        1,1,1,1,1,0,1,
        1,0,1,1,1,0,1,
        1,0,0,1,1,0,1,
        1,0,0,0,1,0,1,
        1,0,0,0,0,0,1
      ]
    ],
    // 32 HScrollBar right border and arrow
    [
      [7,9],
      [
        1,0,0,0,0,0,1,
        1,0,1,0,0,0,1,
        1,0,1,1,0,0,1,
        1,0,1,1,1,0,1,
        1,0,1,1,1,1,1,
        1,0,1,1,1,0,1,
        1,0,1,1,0,0,1,
        1,0,1,0,0,0,1,
        1,0,0,0,0,0,1
      ]
    ]
  ];
  // LCD sign meta data table
  wqx.prototype.LCD_META_MAP=[
    [1,2,0],		// 00 (0 number vertical)
    [2,1,1],		// 01 (1 number horizontal)
    [7,2,0],		// 02 (0 number vertical)
    [2,10,1],		// 03 (1 number horizontal)
    [363,6,2],		// 04 (2 indicator on lcd right)
    [12,2,0],		// 05 (0 number vertical)
    [13,1,1],		// 06 (1 number horizontal)
    [18,2,0],		// 07 (0 number vertical)
    [13,10,1],		// 08 (1 number horizontal)
    [21,6,3],		// 09 (3 colon between numbers)
    [25,2,0],		// 10 (0 number vertical)
    [26,1,1],		// 11 (1 number horizontal)
    [363,20,2],		// 12 (2 indicator on lcd right)
    [31,2,0],		// 13 (0 number vertical)
    [26,10,1],		// 14 (1 number horizontal)
    [36,2,0],		// 15 (0 number vertical)
    [37,1,1],		// 16 (1 number horizontal)
    [42,2,0],		// 17 (0 number vertical)
    [37,10,1],		// 18 (1 number horizontal)
    [42,11,0],		// 19 (0 number vertical)
    [363,38,2],		// 20 (2 indicator on lcd right)
    [37,19,1],		// 21 (1 number horizontal)
    [36,11,0],		// 22 (0 number vertical)
    [33,17,4],		// 23 (4 dot between numbers)
    [31,11,0],		// 24 (0 number vertical)
    [26,19,1],		// 25 (1 number horizontal)
    [25,11,0],		// 26 (0 number vertical)
    [21,17,4],		// 27 (4 dot between numbers)
    [363,52,2],		// 28 (2 indicator on lcd right)
    [18,11,0],		// 29 (0 number vertical)
    [13,19,1],		// 30 (1 number horizontal)
    [12,11,0],		// 31 (0 number vertical)
    [9,17,4],		// 32 (4 dot between numbers)
    [7,11,0],		// 33 (0 number vertical)
    [2,19,1],		// 34 (1 number horizontal)
    [1,11,0],		// 35 (0 number vertical)
    [363,70,2],		// 36 (2 indicator on lcd right)
    [29,21,5],		// 37 (5 star sign)
    [15,21,6],		// 38 (6 double uparrow)
    [12,32,7],		// 39 (7 NUM indicator)
    [12,42,8],		// 40 (8 ENG indicator)
    [12,52,9],		// 41 (9 CAPS indicator)
    [12,62,10],		// 42 (10 SHIFT indicator)
    [3,31,11],		// 43 (11 VScrollBar process indicator)
    [363,84,2],		// 44 (2 indicator on lcd right)
    [3,43,11],		// 45 (11 VScrollBar process indicator)
    [30,72,12],		// 46 (12 lighting sign)
    [14,72,13],		// 47 (13 alarm bell sign)
    [31,83,14],		// 48 (14 musical note sign)
    [13,83,15],		// 49 (15 data communication sign)
    [29,94,16],		// 50 (16 loudspeaker sign)
    [13,94,17],		// 51 (17 ringing sign)
    [363,102,2],	// 52 (2 indicator on lcd right)
    [29,104,18],	// 53 (18 magnet needle sign)
    [14,105,19],	// 54 (19 tape sign)
    [13,114,20],	// 55 (20 horizontal line sign)
    [3,55,11],		// 56 (11 VScrollBar process indicator)
    [3,91,11],		// 57 (11 VScrollBar process indicator)
    [15,118,21],	// 58 (21 battery sign)
    [28,118,22],	// 59 (22 key sign)
    [363,116,2],	// 60 (2 indicator on lcd right)
    [14,127,23],	// 61 (23 double leftarrow)
    [30,127,24],	// 62 (24 double rightarrow)
    [30,140,25],	// 63 (25 leftarrow)
    [15,137,26],	// 64 (26 double downarrow)
    [],				// 65 (VScrollBar border, will be processed specifically)
    [2,140,27],		// 66 (27 VScrollBar downarrow)
    [9,150,28],		// 67 (28 HScrollBar process indicator)
    [363,134,2],	// 68 (2 indicator on lcd right)
    [18,150,28],	// 69 (28 HScrollBar process indicator)
    [364,140,29],	// 70 (29 rightarrow)
    [27,150,28],	// 71 (28 HScrollBar process indicator)
    [],				// 72 (HScrollBar border, will be processed specifically)
    [3,127,11],		// 73 (11 VScrollBar process indicator)
    [363,148,2],	// 74 (2 indicator on lcd right)
    [3,115,11],		// 75 (11 VScrollBar process indicator)
    [3,103,11],		// 76 (11 VScrollBar process indicator)
    [3,79,11],		// 77 (11 VScrollBar process indicator)
    [3,67,11],		// 78 (11 VScrollBar process indicator)
    [2,22,30]		// 79 (30 VScrollBar uparrow)
  ];
  wqx.prototype.LCD_HSB_LEFT_META=[1,149,31];	// (31 HScrollBar left border and arrow)
  wqx.prototype.LCD_HSB_RIGHT_META=[36,149,32];	// (32 HScrollBar right border and arrow)
  // inner functions
  wqx.prototype.pref=function(buff,offset,len){
    return new Uint8Array(buff.buffer,buff.byteOffset+offset,len);
  };
  wqx.prototype.getRegf=function(){
    return (this.flagc)|(this.flagz<<1)|(this.flagi<<2)|(this.flagd<<3)|(this.flagb<<4)|0x20|(this.flagv<<6)|(this.flagn<<7);
  };
  wqx.prototype.setRegf=function(val){
    this.flagc=(val&0x01);
    this.flagz=(val&0x02)>>>1;
    this.flagi=(val&0x04)>>>2;
    this.flagd=(val&0x08)>>>3;
    this.flagb=(val&0x10)>>>4;
    this.flagv=(val&0x40)>>>6;
    this.flagn=(val&0x80)>>>7;
  };
  wqx.prototype.setnz=function(val){
    this.flagn=(val&0x80)>>>7;
    this.flagz=!val|0;
    return val;
  };
  wqx.prototype.peekByte=function(addr){
    return this.memMap[addr>>>13][addr&0x1FFF];
  };
  wqx.prototype.peekWord=function(addr){
    return this.peekByte(addr)|(this.peekByte((addr+1)&0xFFFF)<<8);
  };
  wqx.prototype.push=function(val){
    this.stack[this.regs]=val;
    this.regs=(this.regs-1)&0xFF;
  };
  wqx.prototype.pop=function(){
    return this.stack[this.regs=(this.regs+1)&0xFF];
  };
  wqx.prototype.load=function(addr){
    if(addr<0x40){
      return this.ioRead[addr](this,addr);
    }
    if((this.flsStep===4&&this.flsType===2||this.flsStep===6&&this.flsType===3)&&addr>=0x4000&&addr<0xC000){
      this.flsStep=0;
      return 0x88;
    }
    if(this.wakeUpPending&&addr===0x45F){
      this.wakeUpPending=false;
      this.ram[addr]=this.wakeUpVal;
      return this.wakeUpVal;
    }
    return this.peekByte(addr);
  };
  wqx.prototype.store=function(addr,val){
    if(addr<0x40){
      this.ioWrite[addr](this,addr,val);
      return;
    }
    if(addr<0x4000){
      this.memMap[addr>>>13][addr&0x1FFF]=val;
      return;
    }
    var page=this.memMap[addr>>>13];
    if(page===this.page2||page===this.page6){
      page[addr&0x1FFF]=val;
      return;
    }
    if(addr>=0xE000){
      return;
    }
    // write to NOR FLASH address space
    // there must select a NOR BANK
    var bankIdx=this.pio[0x00];
    if(bankIdx>=0x20){
      return;
    }
    var flsBank=this.norBanks[bankIdx];
    if(this.flsStep===0){
      if(addr===0x5555&&val===0xAA){
        this.flsStep=1;
      }
      return;
    }
    if(this.flsStep===1){
      if(addr===0xAAAA&&val===0x55){
        this.flsStep=2;
        return;
      }
    }else if(this.flsStep===2){
      if(addr===0x5555){
        this.flsType=this.FLS_TYPE_MAP[val];
        if(this.flsType){
          if(this.flsType===1){
            this.flsBank=flsBank;
            this.flsBak1=flsBank[0x4000];
            this.flsBak1=flsBank[0x4001];
          }
          this.flsStep=3;
          return;
        }
      }
    }else if(this.flsStep===3){
      if(this.flsType===1){
        if(val===0xF0){
          this.flsBank[0x4000]=this.flsBak1;
          this.flsBank[0x4001]=this.flsBak2;
          this.flsStep=0;
          return;
        }
      }else if(this.flsType===2){
        flsBank[addr-0x4000]&=val;
        this.flsStep=4;
        return;
      }else if(this.flsType===4){
        this.flsBuff[addr&0xFF]&=val;
        this.flsStep=4;
        return;
      }else if(this.flsType===3||this.flsType===5){
        if(addr===0x5555&&val===0xAA){
          this.flsStep=4;
          return;
        }
      }
    }else if(this.flsStep===4){
      if(this.flsType===3||this.flsType===5){
        if(addr===0xAAAA&&val===0x55){
          this.flsStep=5;
          return;
        }
      }
    }else if(this.flsStep===5){
      if(addr===0x5555&&val===0x10){
        this.norBanks.forEach(function(norBank){
          this.memSet(norBank,0xFF,0x8000);
        },this);
        if(this.flsType===5){
          this.memSet(this.flsBuff,0xFF,0x100);
        }
        this.flsStep=6;
        return;
      }
      if(this.flsType===3){
        if(val===0x30){
          this.memSet(this.pref(flsBank,addr-(addr%0x800)-0x4000,0x800),0xFF,0x800);
          this.flsStep=6;
          return;
        }
      }else if(this.flsType===5){
        if(val===0x48){
          this.memSet(this.flsBuff,0xFF,0x100);
          this.flsStep=6;
          return;
        }
      }
    }
    if(addr===0x8000&&val===0xF0){
      this.flsStep=0;
      return;
    }
    console.log('error occurs when operate in flash!');
  };
  wqx.prototype.memSet=function(dest,val,size){
    for(var i=0;i<size;i++){
      dest[i]=val;
    }
  };
  wqx.prototype.memCpy=function(dest,src,size){
    for(var i=0;i<size;i++){
      dest[i]=src[i];
    }
  };
  wqx.prototype.switchBank=function(bank){
    this.memMap[2]=this.pref(bank,0,0x2000);
    this.memMap[3]=this.pref(bank,0x2000,0x2000);
    this.memMap[4]=this.pref(bank,0x4000,0x2000);
    this.memMap[5]=this.pref(bank,0x6000,0x2000);
  };
  wqx.prototype.get40Pt=function(idx){
    if(idx<4){
      return this.pio;
    }else{
      return this.pref(this.page0,(idx+4)<<6,0x40);
    }
  };
  wqx.prototype.fillBbsPage=function(vol){
    for(var i=0;i<4;i++){
      this.bbsPages[i*4]=this.pref(vol[i],0,0x2000);
      this.bbsPages[i*4+1]=this.pref(vol[i],0x2000,0x2000);
      this.bbsPages[i*4+2]=this.pref(vol[i],0x4000,0x2000);
      this.bbsPages[i*4+3]=this.pref(vol[i],0x6000,0x2000);
    }
    this.bbsPages[1]=this.page6;
  };
  wqx.prototype.genAndPlayWav=function(){
  };
  wqx.prototype.adjustTime=function(){
    if(++this.clockBuff[0]>=60){
      this.clockBuff[0]=0;
      if(++this.clockBuff[1]>=60){
        this.clockBuff[1]=0;
        if(++this.clockBuff[2]>=24){
          this.clockBuff[2]&=0xC0;
          ++this.clockBuff[3];
        }
      }
    }
  };
  wqx.prototype.countDown=function(){
    if(!(this.clockBuff[10]&0x02)||!(this.clockFlag&0x02)){
      return false;
    }
    return (this.clockBuff[7]&0x80)&&!((this.clockBuff[7]^this.clockBuff[2])&0x1F)||(this.clockBuff[6]&0x80)&&!((this.clockBuff[6]^this.clockBuff[1])&0x3F)||(this.clockBuff[5]&0x80)&&!((this.clockBuff[5]^this.clockBuff[0])&0x3F);
  };
  wqx.prototype.irq=function(){
    if(!this.flagi){
      this.push(this.regpc>>>8);
      this.push(this.regpc&0xFF);
      this.flagb=0;
      this.push(this.getRegf());
      this.regpc=this.peekWord(this.IRQ_ADDR);
      this.flagi=1;
    }
  };
  wqx.prototype.procBin=function(dest,src){
    var offset=0;
    while(offset<src.byteLength){
      var dest1=this.pref(dest,offset+0x4000,0x4000);
      var dest2=this.pref(dest,offset,0x4000);
      var src1=this.pref(src,offset,0x4000);
      var src2=this.pref(src,offset+0x4000,0x4000);
      this.memCpy(dest1,src1,0x4000);
      this.memCpy(dest2,src2,0x4000);
      offset+=0x8000;
    }
  };
  wqx.prototype.execute=function(){
    var opCd=this.peekByte(this.regpc);
    this.regpc=(this.regpc+1)&0xFFFF;
    return this.CPU_INS[opCd](this);
  };
  wqx.prototype.createImgData=function(width,height,pixArray){
    var imgd=this.lcdCtx.createImageData(width,height);
    for(var y=0;y<height;y++){
      for(var x=0;x<width;x++){
        var dotIdx=y*width+x;
        imgd.data[dotIdx*4]=0;
        imgd.data[dotIdx*4+1]=0;
        imgd.data[dotIdx*4+2]=0;
        if(pixArray[dotIdx]){
          imgd.data[dotIdx*4+3]=255;
        }else{
          imgd.data[dotIdx*4+3]=0;
        }
      }
    }
    return imgd;
  };
  wqx.prototype.putPixel=function(x,y,p){
    if(p){
      this.lcdCtx.fillRect(x*2+42,y*2,2,2);
    }else{
      this.lcdCtx.clearRect(x*2+42,y*2,2,2);
    }
  };
  wqx.prototype.drawSign=function(r,p){
    if(r===65){
      // vertical srollbar border
      if(p){
        this.lcdCtx.fillRect(1,21,1,61);
        this.lcdCtx.fillRect(10,21,1,61);
        this.lcdCtx.fillRect(1,86,1,61);
        this.lcdCtx.fillRect(10,86,1,61);
        this.lcdCtx.fillRect(2,21,8,1);
        this.lcdCtx.fillRect(2,29,8,1);
        this.lcdCtx.fillRect(2,138,8,1);
        this.lcdCtx.fillRect(2,146,8,1);
      }else{
        this.lcdCtx.clearRect(1,21,1,126);
        this.lcdCtx.clearRect(10,21,1,126);
        this.lcdCtx.clearRect(2,21,8,1);
        this.lcdCtx.clearRect(2,29,8,1);
        this.lcdCtx.clearRect(2,138,8,1);
        this.lcdCtx.clearRect(2,146,8,1);
      }
    }else if(r===72){
      // horizontal scollbar border
      var leftIdx=this.LCD_HSB_LEFT_META[2];
      var rightIdx=this.LCD_HSB_RIGHT_META[2];
      if(p){
        this.lcdCtx.fillRect(1,148,42,1);
        this.lcdCtx.fillRect(1,158,42,1);
        this.lcdCtx.putImageData(this.lcdImgTbl[leftIdx],this.LCD_HSB_LEFT_META[0],this.LCD_HSB_LEFT_META[1]);
        this.lcdCtx.putImageData(this.lcdImgTbl[rightIdx],this.LCD_HSB_RIGHT_META[0],this.LCD_HSB_RIGHT_META[1]);
      }else{
        this.lcdCtx.clearRect(1,148,42,1);
        this.lcdCtx.clearRect(1,158,42,1);
        this.lcdCtx.clearRect(this.LCD_HSB_LEFT_META[0],this.LCD_HSB_LEFT_META[1],this.LCD_PIX_MAP[leftIdx][0][0],this.LCD_PIX_MAP[leftIdx][0][1]);
        this.lcdCtx.clearRect(this.LCD_HSB_RIGHT_META[0],this.LCD_HSB_RIGHT_META[1],this.LCD_PIX_MAP[rightIdx][0][0],this.LCD_PIX_MAP[rightIdx][0][1]);
      }
    }else{
      if(p){
        this.lcdCtx.putImageData(this.lcdImgTbl[this.LCD_META_MAP[r][2]],this.LCD_META_MAP[r][0],this.LCD_META_MAP[r][1]);
      }else{
        var idx=this.LCD_META_MAP[r][2];
        this.lcdCtx.clearRect(this.LCD_META_MAP[r][0],this.LCD_META_MAP[r][1],this.LCD_PIX_MAP[idx][0][0],this.LCD_PIX_MAP[idx][0][1]);
      }
    }
  }
  wqx.prototype.updateLcd=function(){
    if(!this.lcdCtx||!this.plcd) return;
    var plcd=this.plcd;
    var lcd_buff=this.lcdBuff;
    for(var y=0;y<80;y++){
      for(var j=0;j<20;j++){
        var offset=20*y+j;
        var old_pixel=lcd_buff[offset];
        var new_pixel=plcd[offset];
        var changed=old_pixel^new_pixel;
        if(changed){
          lcd_buff[offset]=new_pixel;
          if(changed&0x80){
            if(j>0){
              this.putPixel(j*8,y,new_pixel&0x80);
            }else{
              this.drawSign(y,new_pixel&0x80);
            }
          }
          if(changed&0x40) this.putPixel(j*8+1,y,new_pixel&0x40);
          if(changed&0x20) this.putPixel(j*8+2,y,new_pixel&0x20);
          if(changed&0x10) this.putPixel(j*8+3,y,new_pixel&0x10);
          if(changed&0x08) this.putPixel(j*8+4,y,new_pixel&0x08);
          if(changed&0x04) this.putPixel(j*8+5,y,new_pixel&0x04);
          if(changed&0x02) this.putPixel(j*8+6,y,new_pixel&0x02);
          if(changed&0x01) this.putPixel(j*8+7,y,new_pixel&0x01);
        }
      }
    }
  };
  wqx.prototype.frame=function(){
    var nextT0Cyc=this.nextTimer0Cyc;
    var nextT1Cyc=this.nextTimer1Cyc;
    var should_irq=false;
    var cyc=this.cyc;
    while(cyc<this.cycFrames){
      cyc=(cyc+this.execute())|0;
      if(cyc>=nextT0Cyc){
        nextT0Cyc=(nextT0Cyc+this.CYC_TIMER0)|0;
        this.timer0Cnt=(this.timer0Cnt+1)|0;
        if(!(this.timer0Cnt&0x01)){
          this.adjustTime();
        }
        if(!this.countDown()||(this.timer0Cnt&0x01)){
          this.pio[0x3D]=0;
        }else{
          this.pio[0x3D]=0x20;
          this.clockFlag&=0xFD;
        }
        should_irq=true;
      }
      if(should_irq&&!this.flagi){
        should_irq=false;
        this.irq();
        cyc=(cyc+7)|0;
      }
      if(cyc>=nextT1Cyc){
        nextT1Cyc=(nextT1Cyc+this.CYC_TIMER1)|0;
        this.clockBuff[4]++;
        if(!this.shouldWakeUp){
          this.pio[0x01]|=0x08;
          should_irq=true;
        }else{
          this.pio[0x01]|=0x01;
          this.pio[0x02]|=0x01;
          this.regpc=this.peekWord(this.RESET_ADDR);
          this.shouldWakeUp=false;
        }
      }
    }
    this.nextTimer0Cyc=(nextT0Cyc-this.cycFrames)|0;
    this.nextTimer1Cyc=(nextT1Cyc-this.cycFrames)|0;
    this.cyc=(cyc-this.cycFrames)|0;
    this.updateLcd();
  };
  // outer functions
  wqx.prototype.init=function(rom,ctx,nor){
    this.procBin(this.rom,new Uint8Array(rom));
    if(ctx){
      this.lcdCtx=ctx;
      this.lcdCtx.fillStyle='#000000';
      // init lcd sign img data
      var len=this.LCD_PIX_MAP.length;
      for(var i=0;i<len;i++){
        this.lcdImgTbl[i]=this.createImgData(this.LCD_PIX_MAP[i][0][0],this.LCD_PIX_MAP[i][0][1],this.LCD_PIX_MAP[i][1]);
      }
    }
    if(nor){
      this.procBin(this.nor,new Uint8Array(nor));
    }
  };
  wqx.prototype.setNor=function(nor){
    this.procBin(this.nor,new Uint8Array(nor));
  };
  wqx.prototype.getNor=function(){
    var buff=new Uint8Array(this.nor.byteLength);
    this.procBin(buff,this.nor);
    return buff;
  };
  wqx.prototype.reset=function(){
    this.memSet(this.ram,0,0x8000);
    this.memMap[0]=this.page0;
    this.memMap[1]=this.page1;
    this.switchBank(this.romVol0[0]);
    this.fillBbsPage(this.romVol0);
    this.memMap[6]=this.bbsPages[0];
    this.memMap[7]=this.pref(this.romVol0[0],0x2000,0x2000);
    this.rega=0;
    this.regx=0;
    this.regy=0;
    this.regs=0xFF;
    this.setRegf(0x24);
    this.regpc=this.peekWord(this.RESET_ADDR);
    if(this.lcdCtx){
      this.lcdCtx.clearRect(0,0,376,160);
    }
    this.memSet(this.lcdBuff,0,1600);
    this.memSet(this.clockBuff,0,80);
    this.clockFlag=0;
    this.memSet(this.wavBuff,0,0x20);
    this.wavFlag=0;
    this.wavIdx=0;
    this.wavPlaying=0;
    this.flsStep=0;
    this.slept=false;
    this.shouldWakeUp=false;
    this.cyc=0;
    this.nextTimer0Cyc=this.CYC_TIMER0;
    this.nextTimer1Cyc=this.CYC_TIMER1;
    this.timer0Cnt=0;
  };
  wqx.prototype.play=function(){
    if(!this.frameTimer){
      this.frameTimer=setInterval(this.frame.bind(this),this.frameDelay);
    }
  };
  wqx.prototype.stop=function(){
    if(this.frameTimer){
      clearInterval(this.frameTimer);
      this.frameTimer=0;
    }
  };
  wqx.prototype.running=function(){
    return this.frameTimer;
  };
  wqx.prototype.setKey=function(key,val){
    var row=key&0x07;
    var col=key>>>3;
    var bits=(key===0x0F)?0xFE:(1<<col);
    if(val){
      this.keyGrid[row]|=bits;
    }else{
      this.keyGrid[row]&=~bits;
    }
    if(val){
      if(this.slept){
        if(key>=0x08&&key<=0x0F&&key!==0x0E){
          this.shouldWakeUp=true;
          this.wakeUpPending=true;
          this.wakeUpVal=this.WAKE_UP_MAP[key];
          this.slept=false;
        }
      }else{
        if(key===0x0F){
          this.slept=true;
        }
      }
    }
  };
  wqx.prototype.changeSpeed=function(speedMulti){
    var running=this.running();
    if(running){
      this.stop();
    }
    if(speedMulti<=0){
      this.frameDelay=0;
      this.cycFrames=this.BASE_CYC_FRAMES;
    }else if(speedMulti>=1){
      this.frameDelay=this.BASE_FRAME_DELAY/speedMulti;
      this.cycFrames=this.BASE_CYC_FRAMES;
    }else{
      this.frameDelay=this.BASE_FRAME_DELAY;
      this.cycFrames=Math.round(this.BASE_CYC_FRAMES*speedMulti);
    }
    if(running){
      this.play();
    }
  };
  return wqx;
})();
